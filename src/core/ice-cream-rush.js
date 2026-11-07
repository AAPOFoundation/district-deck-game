// Ice Cream Rush — memory-order + culinary showmanship. No DOM.
// Remember a 5–8 item ticket. Tap those types. Lines of 3+ pop for extra cash.
// Dairy melts in place. Serving a slumping scoop pays less. Gone-bad tiles
// stay on the hatch, cannot be used, and cost a spoilage fee. More than three
// melted dairy tiles on the bottom row is one bad review.

export const ITEMS = Object.freeze([
  'waffle',
  'cone',
  'cup',
  'banana-split',
  'gelato',
  'ice-cream',
  'scoop',
  'cherry',
]);

export const ITEM_LABEL = Object.freeze({
  waffle: 'Waffle',
  cone: 'Cone',
  cup: 'Cup',
  'banana-split': 'Banana split',
  gelato: 'Gelato',
  'ice-cream': 'Ice cream',
  scoop: 'Scoop',
  cherry: 'Cherry',
});

export const SIZE = 8;
export const MIN_ORDER = 5;
export const MAX_ORDER = 8;
export const HINTS_PER_ORDER = 1;
export const MISTAKES_ALLOWED = 1;
export const REVIEWS_TO_CLOSE = 5;
export const PAY_PER_ITEM = 250;
export const PAY_MELT_1 = 150;
export const PAY_MELT_2 = 80;
export const SHOW_3 = 90;
export const MELT_COST = 80;
export const MELT_SPOIL = 3;
export const MELT_PER_TICK = 7;
export const BOTTOM_MELT_REVIEW = 3;
export const ASSET = './assets/img/ice-cream-rush';

/** Ice cream that slumps. Waffle, cone, cherry stay dry. */
export const MELTS = Object.freeze(['ice-cream', 'scoop', 'gelato', 'banana-split', 'cup']);
export const DRY = Object.freeze(['waffle', 'cone', 'cherry']);

const PRODUCT_FOR = Object.freeze({
  waffle: 'product-waffle.jpg',
  cone: 'product.jpg',
  cup: 'product-cup.jpg',
  'banana-split': 'product-banana-split.jpg',
  gelato: 'product-gelato.jpg',
  'ice-cream': 'product.jpg',
  scoop: 'product.jpg',
  cherry: 'product-sundae.jpg',
});

export function canMelt(type) {
  return MELTS.includes(type);
}

export function itemSrc(id, melt = 0) {
  if (canMelt(id) && melt >= MELT_SPOIL) return `${ASSET}/${id}-spoiled.jpg`;
  if (canMelt(id) && melt >= 1) return `${ASSET}/${id}-melt.jpg`;
  return `${ASSET}/${id}.jpg`;
}

export function servePay(type, melt = 0) {
  if (!canMelt(type)) return PAY_PER_ITEM;
  if (melt >= MELT_SPOIL) return 0;
  if (melt >= 2) return PAY_MELT_2;
  if (melt >= 1) return PAY_MELT_1;
  return PAY_PER_ITEM;
}

export function collectedTypes(collected) {
  return (collected ?? []).map((item) => (typeof item === 'string' ? item : item.type));
}

export function payoutCollected(collected) {
  return (collected ?? []).reduce((sum, item) => {
    if (typeof item === 'number') return sum + item;
    if (item && typeof item === 'object') return sum + (item.pay ?? servePay(item.type, item.melt));
    return sum + PAY_PER_ITEM;
  }, 0);
}

export function bottomMeltedCount(board) {
  let n = 0;
  for (let c = 0; c < SIZE; c += 1) {
    const cell = cellLook(board[SIZE - 1]?.[c]);
    if (cell && canMelt(cell.type) && (cell.melt ?? 0) >= MELT_SPOIL) n += 1;
  }
  return n;
}

export function productSrc(order) {
  const counts = new Map();
  for (const id of order ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
  let top = 'ice-cream';
  let best = -1;
  for (const [id, n] of counts) {
    if (n > best) {
      top = id;
      best = n;
    }
  }
  return `${ASSET}/${PRODUCT_FOR[top] ?? 'product.jpg'}`;
}

export function makeRng(seed = 1) {
  let s = (Number(seed) >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function memorizeMs(length) {
  return 2600 + Math.max(0, length) * 380;
}

export function orderLengthFor(served) {
  return Math.min(MAX_ORDER, MIN_ORDER + Math.floor(Math.max(0, served) / 2));
}

export function payoutFor(order) {
  return Math.max(0, (order?.length ?? 0) * PAY_PER_ITEM);
}

export function showmanshipPay(len) {
  return len >= 3 ? SHOW_3 : 0;
}

export function makeCell(type, extra = {}) {
  return {
    type,
    melt: extra.melt ?? 0,
    special: extra.special ?? null,
  };
}

export function cellType(cell) {
  if (!cell) return null;
  if (typeof cell === 'string') return cell;
  if (cell.special) return null;
  if ((cell.melt ?? 0) >= MELT_SPOIL) return null;
  return cell.type;
}

export function cellLook(cell) {
  if (!cell) return null;
  if (typeof cell === 'string') return { type: cell, melt: 0, special: null };
  return cell;
}

export function dealBoard(rng) {
  const bag = ITEMS.flatMap((id) => Array.from({ length: SIZE }, () => makeCell(id)));
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = bag[i];
    bag[i] = bag[j];
    bag[j] = tmp;
  }
  const cells = [];
  for (let r = 0; r < SIZE; r += 1) {
    cells.push(bag.slice(r * SIZE, (r + 1) * SIZE));
  }
  return quietBoard(cells, rng);
}

function quietBoard(board, rng) {
  let next = board;
  for (let i = 0; i < 14; i += 1) {
    const runs = findRuns(next);
    if (!runs.length) return next;
    next = gravityRefill(applyRuns(next, runs).board, rng);
  }
  return next;
}

export function dealOrder(rng, length) {
  const n = Math.max(MIN_ORDER, Math.min(MAX_ORDER, length));
  return Array.from({ length: n }, () => ITEMS[Math.floor(rng() * ITEMS.length)]);
}

export function remainingCounts(order, collected) {
  const need = new Map();
  for (const id of order) need.set(id, (need.get(id) ?? 0) + 1);
  for (const id of collected) need.set(id, (need.get(id) ?? 0) - 1);
  return need;
}

export function stillNeeds(order, collected, type) {
  return (remainingCounts(order, collectedTypes(collected)).get(type) ?? 0) > 0;
}

export function orderComplete(order, collected) {
  const types = collectedTypes(collected);
  if (types.length !== order.length) return false;
  const need = remainingCounts(order, types);
  for (const n of need.values()) {
    if (n !== 0) return false;
  }
  return true;
}

export function gravityRefill(board, rng) {
  const next = board.map((row) => row.slice());
  for (let c = 0; c < SIZE; c += 1) {
    const stack = [];
    for (let r = SIZE - 1; r >= 0; r -= 1) {
      if (next[r][c]) stack.push(next[r][c]);
    }
    for (let r = SIZE - 1; r >= 0; r -= 1) {
      const kept = stack[SIZE - 1 - r];
      next[r][c] = kept ?? makeCell(ITEMS[Math.floor(rng() * ITEMS.length)]);
    }
  }
  return next;
}

export function findRuns(board) {
  const runs = [];
  for (let r = 0; r < SIZE; r += 1) {
    let c = 0;
    while (c < SIZE) {
      const t = cellType(board[r][c]);
      if (!t) { c += 1; continue; }
      let k = c + 1;
      while (k < SIZE && cellType(board[r][k]) === t) k += 1;
      if (k - c >= 3) {
        const cells = [];
        for (let x = c; x < k; x += 1) cells.push([r, x]);
        runs.push({ type: t, len: k - c, dir: 'h', cells, row: r, col: c });
      }
      c = k;
    }
  }
  for (let c = 0; c < SIZE; c += 1) {
    let r = 0;
    while (r < SIZE) {
      const t = cellType(board[r][c]);
      if (!t) { r += 1; continue; }
      let k = r + 1;
      while (k < SIZE && cellType(board[k][c]) === t) k += 1;
      if (k - r >= 3) {
        const cells = [];
        for (let y = r; y < k; y += 1) cells.push([y, c]);
        runs.push({ type: t, len: k - r, dir: 'v', cells, row: r, col: c });
      }
      r = k;
    }
  }
  return runs;
}

/** Cell plus same-type orthogonal neighbours — tap-3 showmanship. */
export function adjacentCluster(board, row, col) {
  const t = cellType(board[row]?.[col]);
  if (!t) return [];
  const cells = [[row, col]];
  for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const rr = row + dr;
    const cc = col + dc;
    if (rr < 0 || cc < 0 || rr >= SIZE || cc >= SIZE) continue;
    if (cellType(board[rr][cc]) === t) cells.push([rr, cc]);
  }
  return cells;
}

export function applyRuns(board, runs) {
  const next = board.map((row) => row.slice());
  const marked = new Set();
  for (const run of runs) {
    for (const [r, c] of run.cells) marked.add(`${r},${c}`);
  }
  for (const key of marked) {
    const [r, c] = key.split(',').map(Number);
    next[r][c] = null;
  }
  return { board: next, specials: [], cleared: marked.size };
}

export function resolveShowmanship(board, rng) {
  let next = board;
  let pay = 0;
  const fx = [];
  for (let i = 0; i < 8; i += 1) {
    const runs = findRuns(next);
    if (!runs.length) break;
    const applied = applyRuns(next, runs);
    pay += runs.reduce((sum, run) => sum + showmanshipPay(run.len), 0);
    fx.push(...runs);
    next = gravityRefill(applied.board, rng);
  }
  return { board: next, pay, fx };
}

function clearCells(board, cells) {
  const next = board.map((row) => row.slice());
  for (const [r, c] of cells) next[r][c] = null;
  return next;
}

export function tapCell(round, row, col, rng) {
  if (round.phase !== 'serve') return { ...round, event: 'ignored' };
  const raw = round.board[row]?.[col];
  const look = cellLook(raw);
  if (!look) return { ...round, event: 'ignored' };
  if (canMelt(look.type) && (look.melt ?? 0) >= MELT_SPOIL) {
    return { ...round, event: 'spoiled', lastType: look.type };
  }

  const onRun = findRuns(round.board).filter((run) => (
    run.cells.some(([r, c]) => r === row && c === col)
  ));
  if (onRun.length) {
    const applied = applyRuns(round.board, findRuns(round.board));
    const type = look.type;
    const entry = { type, melt: look.melt ?? 0, pay: servePay(type, look.melt ?? 0) };
    const collected = (type && stillNeeds(round.order, round.collected, type))
      ? [...round.collected, entry]
      : round.collected;
    const board = gravityRefill(applied.board, rng);
    const resolved = resolveShowmanship(board, rng);
    const pay = onRun.reduce((sum, run) => sum + showmanshipPay(run.len), 0) + resolved.pay;
    const done = orderComplete(round.order, collected);
    return {
      ...round,
      board: resolved.board,
      collected,
      phase: done ? 'deliver' : 'serve',
      event: done ? 'deliver' : 'showmanship',
      showPay: pay,
      fx: [...onRun, ...resolved.fx],
      lastType: type,
    };
  }

  const cluster = adjacentCluster(round.board, row, col);
  if (cluster.length >= 3) {
    const type = look.type;
    const entry = { type, melt: look.melt ?? 0, pay: servePay(type, look.melt ?? 0) };
    const collected = (type && stillNeeds(round.order, round.collected, type))
      ? [...round.collected, entry]
      : round.collected;
    const board = gravityRefill(clearCells(round.board, cluster), rng);
    const resolved = resolveShowmanship(board, rng);
    const done = orderComplete(round.order, collected);
    return {
      ...round,
      board: resolved.board,
      collected,
      phase: done ? 'deliver' : 'serve',
      event: done ? 'deliver' : 'showmanship',
      showPay: SHOW_3 + resolved.pay,
      fx: [{ kind: 'cluster', cells: cluster, len: cluster.length }, ...resolved.fx],
      lastType: type,
    };
  }

  const type = cellType(raw);
  if (type && stillNeeds(round.order, round.collected, type)) {
    const entry = { type, melt: look.melt ?? 0, pay: servePay(type, look.melt ?? 0) };
    const collected = [...round.collected, entry];
    const board = gravityRefill(clearCells(round.board, [[row, col]]), rng);
    const resolved = resolveShowmanship(board, rng);
    const done = orderComplete(round.order, collected);
    return {
      ...round,
      board: resolved.board,
      collected,
      phase: done ? 'deliver' : 'serve',
      event: done ? 'deliver' : 'collect',
      showPay: resolved.pay,
      collectPay: entry.pay,
      fx: resolved.fx,
      lastType: type,
    };
  }

  const mistakes = round.mistakes + 1;
  if (mistakes > MISTAKES_ALLOWED) {
    return {
      ...round,
      mistakes,
      phase: 'review',
      event: 'review',
      reason: 'wrong',
      lastType: look.type,
    };
  }
  return { ...round, mistakes, event: 'mistake', lastType: look.type };
}

export function meltTick(round, rng) {
  if (round.phase !== 'serve') return { ...round, event: 'ignored', meltCost: 0 };
  const board = round.board.map((row) => row.map((cell) => (cell ? { ...cell } : cell)));
  const candidates = [];
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      const cell = board[r][c];
      if (cell && canMelt(cell.type) && cell.melt < MELT_SPOIL) candidates.push([r, c]);
    }
  }
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = candidates[i];
    candidates[i] = candidates[j];
    candidates[j] = tmp;
  }
  const take = candidates.slice(0, MELT_PER_TICK);
  let meltCost = 0;
  const spoiled = [];
  for (const [r, c] of take) {
    const cell = board[r][c];
    cell.melt += 1;
    if (cell.melt >= MELT_SPOIL) {
      meltCost += MELT_COST;
      spoiled.push([r, c]);
    }
  }
  const bottom = bottomMeltedCount(board);
  const crossed = bottom > BOTTOM_MELT_REVIEW && !round.bottomReview;
  return {
    ...round,
    board,
    event: crossed ? 'bottom-melt' : 'melt',
    meltCost,
    spoiled,
    bottomReview: round.bottomReview || crossed,
  };
}

export function useHint(round) {
  if (round.phase !== 'serve') return { ...round, event: 'ignored' };
  if (round.hintsLeft < 1) return { ...round, event: 'no-hint' };
  return { ...round, hintsLeft: round.hintsLeft - 1, event: 'hint' };
}

export function startRound({ rng, served = 0 }) {
  const length = orderLengthFor(served);
  return {
    phase: 'memorize',
    board: dealBoard(rng),
    order: dealOrder(rng, length),
    collected: [],
    hintsLeft: HINTS_PER_ORDER,
    mistakes: 0,
    event: 'memorize',
    showPay: 0,
    fx: [],
    bottomReview: false,
  };
}

export function openShift(seed) {
  return {
    seed,
    served: 0,
    reviews: 0,
    takings: 0,
    showmanship: 0,
    phase: 'boot',
  };
}
