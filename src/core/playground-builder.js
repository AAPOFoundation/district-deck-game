// District Deck V3.70 L7 — the voxel playground builder on a `playground` block centre.
//
// Pure model. No DOM, no THREE, no clock, no Math.random, no network. The mesh side
// lives in `src/ui/playground-voxels.js`; this file knows only cells, pieces and rules.
//
// The builder is its own world. The board core still lays an 8.4 m softfall pad
// (`types/playground.js`); this overlay is four times that area — a 16 × 16 grid at
// 1.05 m — so a player can join four variants of each piece into a real play circuit.
// Saved builds do not stand on the board yet, so the larger pad does not have to fit
// the core tile.

export const DESIGN_VERSION = 2;
export const ACCEPTED_DESIGN_VERSIONS = Object.freeze([1, 2]);

/** Four times the original 8 × 8 pad: 16 × 16 cells, 16.8 m square. */
export const GRID = 16;
export const LEVELS = 4;
/** Metres per cell. GRID × CELL = 16.8 m — four times the 8.4 m board-core pad. */
export const CELL = 1.05;
/** Block-core local ground, from `block-cores/kit.js` CORE_GROUND. */
export const GROUND_Y = 0.26;
/** Softfall pad centre in core-local space, same file. */
export const PAD_CENTRE = Object.freeze({ x: 0, z: 0.15 });

/** 16 × 16 cells, one piece per cell at the dense end. */
export const MAX_PIECES = 256;

export const VARIANT_COUNT = 4;

/**
 * Nine families, and nine is still the ceiling. Each family now carries four variants
 * that snap together on an edge — a chute plus a wave plus a tube plus a run-out is a
 * slide park, not four lonely toys.
 *
 * `w`/`d` are the family's default footprint; a variant may override them. `h` is
 * levels tall. `stack` says whether the piece can carry another piece on its lid.
 */
export const PIECES = Object.freeze({
  deck: {
    id: 'deck',
    label: 'Climbing frame',
    key: '1',
    w: 2,
    d: 2,
    h: 1,
    stack: true,
    play: true,
    colours: ['sky', 'lime', 'sun', 'coral'],
    note: 'The one piece that carries another. Stack decks to build height.',
    variants: Object.freeze([
      { id: 'platform', label: 'Platform', note: 'Slatted lid. The piece everything else hangs off.' },
      { id: 'stairs', label: 'Stairs', w: 1, d: 2, stack: false, note: 'A flight up. Park it against a platform.' },
      { id: 'bridge', label: 'Bridge', w: 3, d: 1, stack: false, note: 'Joins two frames. A playground that does not connect is a junkyard.' },
      { id: 'lookout', label: 'Lookout', note: 'Taller canopy and a viewing slit — the top of the circuit.' },
    ]),
  },
  slide: {
    id: 'slide',
    label: 'Slide',
    key: '2',
    w: 1,
    d: 3,
    h: 1,
    stack: false,
    play: true,
    needsHeight: true,
    // A chute descends. Only its head needs something under it — the rest is the point.
    descends: true,
    colours: ['sun', 'coral', 'sky', 'lime'],
    note: 'Wants a deck at its head. A slide off the ground is a ramp.',
    variants: Object.freeze([
      { id: 'chute', label: 'Chute', note: 'Straight bed. Starts on a climbing frame.' },
      { id: 'wave', label: 'Wave', note: 'Humps. Join it to a chute and the run gets longer.' },
      { id: 'tube', label: 'Tube', note: 'Enclosed. Children disappear and reappear, which is the point.' },
      {
        id: 'runout',
        label: 'Run-out',
        w: 2,
        d: 2,
        needsHeight: false,
        descends: false,
        ground: true,
        note: 'The landing. Join it to any chute so the fall finishes on purpose.',
      },
    ]),
  },
  swing: {
    id: 'swing',
    label: 'Swing',
    key: '3',
    w: 3,
    d: 1,
    h: 2,
    stack: false,
    play: true,
    colours: ['sun', 'coral', 'sky', 'lime'],
    note: 'Needs a clear cell in front and behind, which the rules enforce.',
    variants: Object.freeze([
      { id: 'bay', label: 'Bay', note: 'Belt and bucket. The classic two-seat frame.' },
      { id: 'basket', label: 'Basket', w: 2, d: 2, note: 'One big cradle. Park it next to a bay.' },
      { id: 'nest', label: 'Nest', w: 2, d: 2, note: 'Round dish on chains. Three kids fit, and they will try for four.' },
      { id: 'extra', label: 'Extra bay', w: 2, d: 1, note: 'Bolts onto a frame. That is how a swing set grows.' },
    ]),
  },
  tunnel: {
    id: 'tunnel',
    label: 'Tunnel',
    key: '4',
    w: 1,
    d: 2,
    h: 1,
    stack: true,
    play: true,
    colours: ['lime', 'sky', 'sun', 'coral'],
    note: 'Crawl-through. Takes a deck on its back if you want a lookout.',
    variants: Object.freeze([
      { id: 'barrel', label: 'Barrel', note: 'Straight crawl. A deck sits on its back.' },
      { id: 'elbow', label: 'Elbow', w: 2, d: 2, note: 'Right-angle. Turns a crawl into a circuit.' },
      { id: 'climb', label: 'Climb tube', note: 'Rungs inside. The tunnel that is also a ladder.' },
      { id: 'portal', label: 'Portal', w: 1, d: 1, note: 'The mouth. Join it to a barrel so the hole has a face.' },
    ]),
  },
  sandpit: {
    id: 'sandpit',
    label: 'Sandpit',
    key: '5',
    w: 2,
    d: 2,
    h: 1,
    stack: false,
    play: true,
    ground: true,
    colours: ['sand'],
    note: 'Ground level only. Sand does not stack, which children test annually.',
    variants: Object.freeze([
      { id: 'pit', label: 'Pit', note: 'Sleeper box. The original hole in the ground.' },
      { id: 'table', label: 'Table', w: 1, d: 1, note: 'Raised tray. Park it on the pit rim.' },
      { id: 'digger', label: 'Digger', w: 1, d: 1, note: 'A toy excavator. The pit is not finished without one.' },
      { id: 'sail', label: 'Shade sail', w: 2, d: 1, note: 'Cloth over the sand. February requires it.' },
    ]),
  },
  roundabout: {
    id: 'roundabout',
    label: 'Roundabout',
    key: '6',
    w: 2,
    d: 2,
    h: 1,
    stack: false,
    play: true,
    ground: true,
    colours: ['coral', 'sun', 'sky', 'lime'],
    note: 'Spins. Ground level only, for reasons the ambulance service has explained.',
    variants: Object.freeze([
      { id: 'spinner', label: 'Spinner', note: 'The wheel. Join the dish and the rocker beside it.' },
      { id: 'dish', label: 'Dish', note: 'Bowl you stand in. The spinner\'s louder cousin.' },
      { id: 'rocker', label: 'Rocker', w: 2, d: 1, note: 'Spring horse. Belongs next to the wheel, not across the pad.' },
      { id: 'seat', label: 'Sit-spin', w: 1, d: 1, note: 'One child, one axis. The small one that finishes the set.' },
    ]),
  },
  seat: {
    id: 'seat',
    label: 'Bench',
    key: '7',
    w: 2,
    d: 1,
    h: 1,
    stack: false,
    play: false,
    colours: ['timber', 'sky'],
    note: 'Somewhere for whoever brought the children to sit down.',
    variants: Object.freeze([
      { id: 'bench', label: 'Bench', note: 'Slats and cast ends. The parent seat.' },
      { id: 'picnic', label: 'Picnic', w: 2, d: 2, note: 'Table and two benches. Lunch has a place.' },
      { id: 'stoop', label: 'Stoop', w: 1, d: 1, note: 'A cube to perch on. Children use it as a throne.' },
      { id: 'pergola', label: 'Pergola', w: 2, d: 2, note: 'Bench under slats. Shade for the grown-ups.' },
    ]),
  },
  tree: {
    id: 'tree',
    label: 'Tree',
    key: '8',
    w: 1,
    d: 1,
    h: 3,
    stack: false,
    play: false,
    ground: true,
    colours: ['leaf'],
    note: 'Shade. The single most requested item on every playground survey ever run.',
    variants: Object.freeze([
      { id: 'plane', label: 'Plane', note: 'The wide crown. Plant it, then plant its cousins.' },
      { id: 'gum', label: 'Gum', note: 'Taller, peeling. The Australian one.' },
      { id: 'hedge', label: 'Hedge', w: 2, d: 1, h: 2, note: 'A clipped run. Joins trees into an edge.' },
      { id: 'grove', label: 'Grove', w: 2, d: 2, note: 'Three stems. A corner that is a wood.' },
    ]),
  },
  surface: {
    id: 'surface',
    label: 'Soft surface',
    key: '9',
    w: 1,
    d: 1,
    h: 0,
    stack: true,
    play: false,
    ground: true,
    flat: true,
    colours: ['rubberR', 'rubberB', 'rubberG'],
    note: 'Rubber softfall. Lies flat, carries anything, and is what stops a fall hurting.',
    variants: Object.freeze([
      { id: 'tile', label: 'Tile', note: 'One cell of pour. The default underfoot.' },
      { id: 'path', label: 'Path', w: 1, d: 2, note: 'A runner. Join tiles into a walk.' },
      { id: 'mound', label: 'Mound', w: 2, d: 2, note: 'A bump in the rubber. The hill they run up.' },
      { id: 'zebra', label: 'Zebra', w: 1, d: 2, note: 'Stripes. Marks the way in from the gate.' },
    ]),
  },
});

export const PIECE_IDS = Object.freeze(Object.keys(PIECES));

export const COLOUR_IDS = Object.freeze([
  'lime', 'sun', 'sky', 'coral', 'sand', 'timber', 'leaf', 'rubberR', 'rubberB', 'rubberG',
]);

export const CHILD_NAMES = Object.freeze([
  'Min', 'Jo', 'Pip', 'Ned', 'Suki', 'Ari', 'Bess', 'Cal', 'Dot', 'Eli', 'Fay', 'Gus',
]);

export const VIBES = Object.freeze(['love', 'mixed', 'sadness']);

export function pieceOf(id) {
  return PIECES[id] ?? null;
}

export function pieceByKey(key) {
  return PIECE_IDS.map((id) => PIECES[id]).find((piece) => piece.key === String(key)) ?? null;
}

export function variantIndexOf(value) {
  const n = Math.round(Number(value) || 0);
  if (!Number.isFinite(n)) return 0;
  return ((n % VARIANT_COUNT) + VARIANT_COUNT) % VARIANT_COUNT;
}

/** Family defaults merged with the chosen variant's overrides. */
export function specOf(pieceId, variant = 0) {
  const piece = pieceOf(pieceId);
  if (!piece) return null;
  const index = variantIndexOf(variant);
  const choice = piece.variants[index];
  return {
    id: piece.id,
    label: piece.label,
    key: piece.key,
    colours: piece.colours,
    note: piece.note,
    variant: index,
    variantId: choice.id,
    variantLabel: choice.label,
    variantNote: choice.note ?? piece.note,
    w: choice.w ?? piece.w,
    d: choice.d ?? piece.d,
    h: choice.h ?? piece.h,
    stack: choice.stack ?? piece.stack,
    play: choice.play ?? piece.play,
    ground: choice.ground ?? piece.ground ?? false,
    needsHeight: choice.needsHeight ?? piece.needsHeight ?? false,
    descends: choice.descends ?? piece.descends ?? false,
    flat: choice.flat ?? piece.flat ?? false,
    swingClear: choice.swingClear ?? piece.id === 'swing',
  };
}

export function emptyDesign({ seed = 0, coreId = 'core' } = {}) {
  return {
    version: DESIGN_VERSION,
    seed: String(seed),
    coreId: String(coreId),
    pieces: [],
  };
}

/** Footprint in world cells after yaw. Yaw is 0/90/180/270 and swaps w and d on odds. */
export function footprint(pieceId, x, z, yaw = 0, variant = 0) {
  const spec = specOf(pieceId, variant);
  if (!spec) return [];
  const turned = ((Math.round(yaw / 90) % 4) + 4) % 4;
  const w = turned % 2 === 0 ? spec.w : spec.d;
  const d = turned % 2 === 0 ? spec.d : spec.w;
  const cells = [];
  for (let dx = 0; dx < w; dx += 1) {
    for (let dz = 0; dz < d; dz += 1) cells.push([x + dx, z + dz]);
  }
  return cells;
}

export function cellsOf(entry) {
  return footprint(entry.id, entry.x, entry.z, entry.yaw, entry.variant);
}

export function spanOf(pieceId, yaw = 0, variant = 0) {
  const spec = specOf(pieceId, variant);
  if (!spec) return { w: 0, d: 0 };
  const turned = ((Math.round(yaw / 90) % 4) + 4) % 4;
  return turned % 2 === 0 ? { w: spec.w, d: spec.d } : { w: spec.d, d: spec.w };
}

function onGrid(cells) {
  return cells.every(([x, z]) => x >= 0 && z >= 0 && x < GRID && z < GRID);
}

/** Every entry occupying [x,z] at any level. */
export function stackAt(design, x, z) {
  return design.pieces.filter((entry) => (
    cellsOf(entry).some(([cx, cz]) => cx === x && cz === z)
  ));
}

/** Height of the topmost solid lid over a cell, in levels. Flat pieces add nothing. */
export function heightAt(design, x, z) {
  let top = 0;
  for (const entry of stackAt(design, x, z)) {
    const spec = specOf(entry.id, entry.variant);
    if (!spec || spec.flat) continue;
    top = Math.max(top, (entry.y ?? 0) + spec.h);
  }
  return top;
}

/** The piece whose lid a new piece would rest on at this cell and level. */
function lidAt(design, x, z, level) {
  for (const entry of stackAt(design, x, z)) {
    const spec = specOf(entry.id, entry.variant);
    if (!spec || spec.flat) continue;
    if ((entry.y ?? 0) + spec.h === level) return entry;
  }
  return null;
}

function occupiesLevel(entry, level) {
  const spec = specOf(entry.id, entry.variant);
  if (!spec) return false;
  if (spec.flat) return level === (entry.y ?? 0);
  const base = entry.y ?? 0;
  return level >= base && level < base + spec.h;
}

/**
 * The whole rule set in one place, and it answers in words a player can read. A
 * placement that fails silently is a bug the player attributes to themselves.
 */
export function canPlace(design, entry) {
  const spec = specOf(entry?.id, entry?.variant);
  if (!spec) return { ok: false, reason: 'No such piece.' };
  if (design.pieces.length >= MAX_PIECES) return { ok: false, reason: 'The playground is full.' };
  const y = Math.max(0, Math.round(entry.y ?? 0));
  const cells = footprint(spec.id, entry.x, entry.z, entry.yaw ?? 0, spec.variant);
  if (!cells.length) return { ok: false, reason: 'No such piece.' };
  if (!onGrid(cells)) return { ok: false, reason: 'That runs off the softfall.' };
  if (y + spec.h > LEVELS) return { ok: false, reason: `Nothing goes above level ${LEVELS}.` };
  if (spec.ground && y !== 0) return { ok: false, reason: `${spec.variantLabel} sits on the ground.` };

  // Soft surface is 7 cm of rubber underfoot. It never contests a cell with anything
  // solid — it goes UNDER it, which is the whole reason it exists. Only two pieces of
  // rubber on the same cell at the same level are a clash.
  for (const [cx, cz] of cells) {
    for (const other of stackAt(design, cx, cz)) {
      const otherSpec = specOf(other.id, other.variant);
      if (!otherSpec) continue;
      if (spec.flat !== otherSpec.flat) continue;
      const clash = spec.flat
        ? (other.y ?? 0) === y
        : [...Array(Math.max(1, spec.h))].some((_, i) => occupiesLevel(other, y + i));
      if (clash) return { ok: false, reason: `${otherSpec.variantLabel} is already there.` };
    }
  }

  if (y > 0 && !spec.flat) {
    // A descending piece is carried at its head and hangs from there.
    const carried = spec.descends ? cells.slice(0, 1) : cells;
    for (const [cx, cz] of carried) {
      const lid = lidAt(design, cx, cz, y);
      if (!lid) return { ok: false, reason: 'Nothing under it. Put a climbing frame there first.' };
      if (!specOf(lid.id, lid.variant).stack) {
        return { ok: false, reason: `${specOf(lid.id, lid.variant).variantLabel} will not carry that.` };
      }
    }
  }
  if (y > 0 && spec.flat) {
    for (const [cx, cz] of cells) {
      if (heightAt(design, cx, cz) !== y) return { ok: false, reason: 'Soft surface lies on a lid or on the ground.' };
    }
  }

  if (spec.needsHeight) {
    const head = cells[0];
    const lidUnderHead = y > 0 ? lidAt(design, head[0], head[1], y) : null;
    if (!lidUnderHead) return { ok: false, reason: 'A slide starts at the top of a climbing frame.' };
  }

  if (spec.swingClear) {
    const clear = swingClearance(design, { ...entry, variant: spec.variant });
    if (!clear.ok) return clear;
  }

  return { ok: true, reason: '' };
}

/** Swings need a clear run fore and aft. Real standards say 2 m; ours says two cells. */
export function swingClearance(design, entry) {
  const variant = variantIndexOf(entry.variant);
  const { w } = spanOf('swing', entry.yaw ?? 0, variant);
  const alongX = w > 1;
  const cells = footprint('swing', entry.x, entry.z, entry.yaw ?? 0, variant);
  for (const [cx, cz] of cells) {
    for (const step of [-1, 1]) {
      const nx = alongX ? cx : cx + step;
      const nz = alongX ? cz + step : cz;
      if (nx < 0 || nz < 0 || nx >= GRID || nz >= GRID) continue;
      const blocked = stackAt(design, nx, nz).some((other) => {
        const otherSpec = specOf(other.id, other.variant);
        return otherSpec && !otherSpec.flat;
      });
      if (blocked) return { ok: false, reason: 'A swing needs a clear cell in front and behind.' };
    }
  }
  return { ok: true, reason: '' };
}

export function place(design, entry) {
  const check = canPlace(design, entry);
  if (!check.ok) return { design, ok: false, reason: check.reason };
  const spec = specOf(entry.id, entry.variant);
  const next = {
    ...design,
    pieces: [...design.pieces, {
      id: spec.id,
      x: Math.round(entry.x),
      z: Math.round(entry.z),
      y: Math.max(0, Math.round(entry.y ?? 0)),
      yaw: (((Math.round((entry.yaw ?? 0) / 90) % 4) + 4) % 4) * 90,
      colour: spec.colours.includes(entry.colour) ? entry.colour : spec.colours[0],
      variant: spec.variant,
    }],
  };
  return { design: next, ok: true, reason: '' };
}

/** Remove the topmost piece over a cell. Removing the bottom of a stack takes the lot. */
export function removeAt(design, x, z) {
  const stack = stackAt(design, x, z);
  if (!stack.length) return { design, ok: false, reason: 'Nothing there.' };
  const top = stack.reduce((best, entry) => (
    (entry.y ?? 0) >= (best.y ?? 0) ? entry : best
  ), stack[0]);
  const kept = design.pieces.filter((entry) => entry !== top);
  const orphaned = kept.filter((entry) => {
    const spec = specOf(entry.id, entry.variant);
    if (!spec || spec.flat || (entry.y ?? 0) === 0) return false;
    const cells = cellsOf(entry);
    const carried = spec.descends ? cells.slice(0, 1) : cells;
    return carried.some(([cx, cz]) => !lidAt({ ...design, pieces: kept }, cx, cz, entry.y ?? 0));
  });
  const survivors = kept.filter((entry) => !orphaned.includes(entry));
  return {
    design: { ...design, pieces: survivors },
    ok: true,
    reason: orphaned.length ? `${orphaned.length} piece(s) came down with it.` : '',
  };
}

export function clearDesign(design) {
  return { ...design, pieces: [] };
}

// --- Kits: four variants of a family, joined on an edge ----------------------

function cellKeysOf(entry) {
  return cellsOf(entry).map(([x, z]) => `${x},${z}`);
}

function entriesTouch(a, b) {
  const mine = new Set(cellKeysOf(a));
  for (const key of cellKeysOf(b)) {
    const [x, z] = key.split(',').map(Number);
    if (mine.has(key)) return true;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (mine.has(`${x + dx},${z + dz}`)) return true;
    }
  }
  return false;
}

/**
 * Connected components of one family. Two pieces join when they share an edge
 * (or overlap, which the rules already refuse at the same level).
 */
export function familyGroups(design) {
  const byFamily = new Map();
  for (const entry of design.pieces) {
    if (!pieceOf(entry.id)) continue;
    const list = byFamily.get(entry.id) ?? [];
    list.push(entry);
    byFamily.set(entry.id, list);
  }
  const groups = [];
  for (const [id, list] of byFamily) {
    const used = new Set();
    for (let i = 0; i < list.length; i += 1) {
      if (used.has(i)) continue;
      const queue = [i];
      used.add(i);
      const cluster = [];
      while (queue.length) {
        const cur = queue.pop();
        cluster.push(list[cur]);
        for (let j = 0; j < list.length; j += 1) {
          if (used.has(j)) continue;
          if (entriesTouch(list[cur], list[j])) {
            used.add(j);
            queue.push(j);
          }
        }
      }
      const variants = [...new Set(cluster.map((entry) => variantIndexOf(entry.variant)))].sort();
      groups.push({ id, pieces: cluster, variants });
    }
  }
  return groups;
}

/** Clusters that already mix two or more variants of the same family. */
export function joinedKits(design) {
  return familyGroups(design).filter((group) => group.variants.length >= 2);
}

/** Families that have all four variants touching in one cluster. */
export function completedSets(design) {
  return familyGroups(design)
    .filter((group) => group.variants.length >= VARIANT_COUNT)
    .map((group) => group.id);
}

// --- Rating ------------------------------------------------------------------
// "The best playground in the world" needs a number or it is just a sandbox. Six
// dimensions, each 0..1, averaged onto the same /5 scale the V370 gate uses so a
// player's build and the programme's grading speak one language.

export const RATING_TARGETS = Object.freeze({
  variety: 5,
  play: 6,
  seats: 2,
  trees: 3,
});

function countBy(design, predicate) {
  return design.pieces.filter((entry) => predicate(specOf(entry.id, entry.variant), entry)).length;
}

/** Play cells that have rubber under them, or are the rubber. Falls land somewhere. */
function safetyCover(design) {
  const playCells = new Set();
  for (const entry of design.pieces) {
    const spec = specOf(entry.id, entry.variant);
    if (!spec?.play) continue;
    for (const [x, z] of cellsOf(entry)) playCells.add(`${x},${z}`);
  }
  if (!playCells.size) return 0;
  const soft = new Set();
  for (const entry of design.pieces) {
    if (entry.id !== 'surface') continue;
    for (const [x, z] of cellsOf(entry)) soft.add(`${x},${z}`);
  }
  let covered = 0;
  for (const key of playCells) if (soft.has(key)) covered += 1;
  return covered / playCells.size;
}

/** Play pieces that touch another play piece. A scattered playground is not a circuit. */
function flow(design) {
  const play = design.pieces.filter((entry) => specOf(entry.id, entry.variant)?.play);
  if (play.length < 2) return 0;
  const cellsMap = new Map();
  for (const entry of play) {
    cellsMap.set(entry, new Set(cellsOf(entry).map(([x, z]) => `${x},${z}`)));
  }
  let joined = 0;
  for (const entry of play) {
    const mine = cellsMap.get(entry);
    const touches = play.some((other) => {
      if (other === entry) return false;
      const theirs = cellsMap.get(other);
      for (const key of mine) {
        const [x, z] = key.split(',').map(Number);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (theirs.has(`${x + dx},${z + dz}`)) return true;
        }
      }
      return false;
    });
    if (touches) joined += 1;
  }
  return joined / play.length;
}

export function rate(design) {
  const kinds = new Set(design.pieces.map((entry) => entry.id));
  const playCount = countBy(design, (spec) => spec?.play);
  const seats = countBy(design, (spec) => spec?.id === 'seat');
  const trees = countBy(design, (spec) => spec?.id === 'tree');
  const height = design.pieces.reduce((best, entry) => (
    Math.max(best, (entry.y ?? 0) + (specOf(entry.id, entry.variant)?.h ?? 0))
  ), 0);

  const parts = {
    variety: Math.min(1, kinds.size / RATING_TARGETS.variety),
    play: Math.min(1, playCount / RATING_TARGETS.play),
    safety: safetyCover(design),
    rest: Math.min(1, seats / RATING_TARGETS.seats),
    shade: Math.min(1, trees / RATING_TARGETS.trees),
    flow: flow(design),
  };
  const keys = Object.keys(parts);
  const mean = keys.reduce((sum, key) => sum + parts[key], 0) / keys.length;
  const weakest = keys.reduce((low, key) => Math.min(low, parts[key]), 1);
  /**
   * Weakest-link weighted, not a plain mean.
   *
   * A critic scripted sixteen pieces with no thought — four trees in the corners and a
   * scatter of equipment — and the plain mean handed it 3.7, which is above the programme's
   * own gate. A playground is judged by the thing a parent notices first, and a mean lets
   * variety pay for the absence of a bench, of shade, or of anything to fall on. Blending in
   * the weakest part means every part has to be present before the score climbs, which is
   * the same rule §1.1 applies to this lane: a mean does not clear the gate.
   */
  let score = 5 * (0.58 * mean + 0.42 * weakest);
  // Equipment standing on bare ground is not a good playground at any variety, so the
  // rating is held below the gate until the falls land on something.
  if (parts.safety < 0.6) score = Math.min(score, 3.0);
  return {
    parts,
    height,
    pieces: design.pieces.length,
    kits: joinedKits(design).length,
    sets: completedSets(design),
    score: Math.round(score * 10) / 10,
  };
}

export function ratingNotes(design) {
  const { parts } = rate(design);
  const notes = [];
  if (parts.variety < 0.6) notes.push('Only a couple of kinds of thing. Mix it up.');
  if (parts.play < 0.5) notes.push('Not much actually to play on yet.');
  if (parts.safety < 0.6) {
    notes.push('Play pieces standing on bare ground. The rating is held at 3 until the falls land on soft surface.');
  } else if (parts.safety < 0.85) {
    notes.push('Some play pieces still stand on bare ground — lay soft surface under them.');
  }
  if (parts.rest < 0.5) notes.push('Nowhere for a parent to sit.');
  if (parts.shade < 0.5) notes.push('No shade. In February that closes the place by ten.');
  if (parts.flow < 0.6) notes.push('The pieces are scattered. Put them within reach of each other.');
  if (!joinedKits(design).length) {
    notes.push('Each toy has four variants. Join two of the same kind on an edge and the set starts to read.');
  } else if (!completedSets(design).length) {
    notes.push('A complete set of four matching variants is what children queue for.');
  }
  if (!notes.length) notes.push('That is a proper playground.');
  return notes;
}

// --- Children, vibe, likes ---------------------------------------------------
// Likes are a function of the build. They are not stored, not cashed, and they do
// not touch the ledger. Children at the gate send love or sadness; a joined,
// shaded, soft playground earns more of the first.

/** Integer hash. No clock, no Math.random — the same design always draws the same kids. */
export function hash32(a, b, c) {
  let n = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

export function likesOf(design) {
  if (!design?.pieces?.length) return 0;
  const report = rate(design);
  return Math.round(report.score * 16 + report.kits * 8 + report.sets.length * 28);
}

export function vibeOf(design) {
  const score = rate(design).score;
  const sets = completedSets(design).length;
  if (score >= 3.5 || sets >= 1) return 'love';
  if (score < 1.5) return 'sadness';
  return 'mixed';
}

export function visitorCount(design) {
  const report = rate(design);
  if (!design.pieces.length) return 2;
  return Math.min(14, 2 + Math.round(report.score * 2) + report.sets.length * 2 + Math.min(3, report.kits));
}

/**
 * The children who will stand at the gate. Positions and timing live in the UI;
 * this is only who they are and whether they arrived in love or in sadness.
 */
export function visitorPlan(design, seed = 0) {
  const n = visitorCount(design);
  const vibe = vibeOf(design);
  const seedN = Number.parseInt(String(seed).replace(/\D/g, ''), 10) || 0;
  const kids = [];
  for (let i = 0; i < n; i += 1) {
    const h = hash32(seedN, i + 1, 91);
    const mood = vibe === 'love' ? 'love'
      : vibe === 'sadness' ? 'sadness'
      : (h % 2 === 0 ? 'love' : 'sadness');
    kids.push({
      id: `kid-${i}`,
      name: CHILD_NAMES[i % CHILD_NAMES.length],
      hue: h % 6,
      mood,
      delay: (h % 40) / 10,
      speed: 0.72 + (h % 5) * 0.07,
      wander: (h >>> 8) % 360,
    });
  }
  return kids;
}

export function likesKey(seed, coreId) {
  return `dd:playground-likes:${seed}:${coreId}`;
}

// --- Persistence -------------------------------------------------------------
// Render-layer-local, exactly like the veggie patch: a saved design is player
// expression, not a simulated quantity. Nothing here reaches `state.js`.

export function designKey(seed, coreId) {
  return `dd:playground:${seed}:${coreId}`;
}

export function serialiseDesign(design) {
  return JSON.stringify({
    version: DESIGN_VERSION,
    seed: design.seed,
    coreId: design.coreId,
    pieces: design.pieces.map(({ id, x, z, y, yaw, colour, variant }) => (
      { id, x, z, y, yaw, colour, variant: variantIndexOf(variant) }
    )),
  });
}

export function parseDesign(text, fallback) {
  try {
    const raw = JSON.parse(String(text));
    if (!raw || !ACCEPTED_DESIGN_VERSIONS.includes(raw.version) || !Array.isArray(raw.pieces)) {
      return fallback;
    }
    const base = emptyDesign({ seed: raw.seed, coreId: raw.coreId });
    // Replay through `place` so a hand-edited or stale file cannot load an illegal build.
    return raw.pieces.reduce((design, entry) => place(design, entry).design, base);
  } catch {
    return fallback;
  }
}

/** Cell centre in block-core local metres — the space `types/playground.js` builds in. */
export function cellToLocal(x, z) {
  return {
    x: PAD_CENTRE.x + (x - (GRID - 1) / 2) * CELL,
    z: PAD_CENTRE.z + (z - (GRID - 1) / 2) * CELL,
  };
}
