import { forcedSaleResolution } from '../core/economy.js';
import { moneyExact } from '../core/format.js';
import { isModalOpen } from './modal.js';

export function forcedSaleDueNotice(city, state) {
  // The settle that ends the run leaves phase 'result' with the due quarter still set, and no further settle follows.
  if (!state || state.phase === 'result') return null;
  const dueQuarter = state.creditByOwner?.player?.forcedSaleDueQuarter;
  if (dueQuarter == null || dueQuarter !== state.quarter) return null;
  const resolution = forcedSaleResolution(city, state, 'player');
  if (resolution?.kind !== 'forced-sale') return null;

  const parcelId = resolution.parcelId ?? null;
  const floor = resolution.overdraftFloor;
  const cash = resolution.cashBefore;
  const shortfall = floor - cash;
  const insolvent = resolution.insolvent === true;
  const consequence = insolvent
    ? 'the run ends at the next settle'
    : `forced sale of ${String(parcelId).toUpperCase()} at the next settle`;
  const text = `Overdraft breached · cash ${moneyExact(cash)} is below the floor of ${moneyExact(floor)} · ${consequence} unless cash rises by ${moneyExact(shortfall)}`;

  return Object.freeze({ parcelId, floor, cash, shortfall, insolvent, text });
}

export function forcedSaleSuggestion(city, state) {
  const notice = forcedSaleDueNotice(city, state);
  if (!notice) return null;
  const { parcelId, floor, cash, shortfall, insolvent } = notice;
  const line = insolvent
    ? `Raise ${moneyExact(shortfall)} before you settle or the run ends.`
    : `Raise ${moneyExact(shortfall)} before you settle to stop the forced sale of ${String(parcelId).toUpperCase()}.`;
  const evidence = `Cash ${moneyExact(cash)} · floor ${moneyExact(floor)}`;
  return { icon: 'bank', line, evidence, key: 'forced-sale' };
}

// A settle with a forced sale due resolves the player's pending assessments inside the forced-sale step, and those rows
// travel in auctionTransactions rather than conditionAssessments. Given the state after the settle, a defect on a parcel
// the player no longer holds (the parcel the same step sold) is left out.
export function defectFoundToasts(event, state = null) {
  const rows = [
    ...(event?.conditionAssessments ?? []),
    ...(event?.auctionTransactions ?? []).filter(({ kind }) => kind === 'condition-assessment'),
  ];
  const named = new Set();
  for (const { owner, outcome, parcelId } of rows) {
    if (owner !== 'player' || outcome !== 'latent-defect' || !parcelId) continue;
    if (state && state.holdings?.[parcelId]?.owner !== 'player') continue;
    named.add(parcelId);
  }
  return [...named].map((parcelId) => `Defect found at ${String(parcelId).toUpperCase()} · rent $0 while damaged · open WORKS, then RENOVATION`);
}

/**
 * The notices one settle leaves for the board: the forced sale due (also passed to the books as forcedSaleDue) and each
 * defect found on a parcel the player still holds. A settle that ends the run leaves none, because the result sheet is
 * the last word and no further settle or works order is possible.
 */
export function settleNoticesFor(city, state, event) {
  if (!state || state.phase === 'result') return { forcedSaleDue: null, texts: [] };
  const forcedSaleDue = forcedSaleDueNotice(city, state);
  return {
    forcedSaleDue,
    texts: [...(forcedSaleDue ? [forcedSaleDue.text] : []), ...defectFoundToasts(event, state)],
  };
}

/** True while something covers the board: the books, the minute, a dialog such as the result sheet, or a hidden page. */
export function boardCovered({ presenter = null, bulletin = globalThis.window?.__districtDeckBulletin } = {}) {
  return Boolean(
    globalThis.document?.hidden
    || presenter?.isOpen
    || bulletin?.isOpen?.()
    || (globalThis.document && isModalOpen()),
  );
}

// The minute polls every 500 ms (quarterly-bulletin.js POLL_MS) and opens once the books have closed, so the board has to
// stay clear for longer than one poll before a held notice is shown; a minute that opens even later only pauses its clock.
export const SETTLE_NOTICE_CLEAR_MS = 750;
export const SETTLE_NOTICE_READ_MS = 8000;
export const SETTLE_NOTICE_TICK_MS = 125;

/**
 * Holds settle notices while the board is covered and shows each one as a held toast once the board has been clear for
 * SETTLE_NOTICE_CLEAR_MS. A shown notice stays for SETTLE_NOTICE_READ_MS of time in which the board is clear and the
 * page is visible, so the books, the minute or a dialog opening over it pause its clock, and the toast caps never trim
 * it (hud.js toast and hud-phone.js trimToasts skip a held toast). The next settle replaces whatever is still held or
 * shown, since its figures are a quarter old.
 */
export class SettleNotices {
  constructor({
    covered = () => false,
    present = () => null,
    retire = (element) => element?.remove?.(),
    now = () => globalThis.performance.now(),
    timers = globalThis,
    clearMs = SETTLE_NOTICE_CLEAR_MS,
    readMs = SETTLE_NOTICE_READ_MS,
    tickMs = SETTLE_NOTICE_TICK_MS,
  } = {}) {
    Object.assign(this, { covered, present, retire, now, timers, clearMs, readMs, tickMs });
    this.held = [];
    this.shown = [];
    this.clearSince = null;
    this.lastTick = null;
    this.timer = 0;
  }

  /** Reads the notices of a settle that has just been applied, holds them, and returns forcedSaleDue for the books. */
  settle(city, state, event) {
    const { forcedSaleDue, texts } = settleNoticesFor(city, state, event);
    this.hold(texts);
    return forcedSaleDue;
  }

  hold(texts) {
    this.clear();
    this.held = [...texts];
    if (this.held.length) this.start();
  }

  start() {
    if (this.timer) return;
    this.clearSince = null;
    this.lastTick = this.now();
    this.timer = this.timers.setInterval(() => this.tick(), this.tickMs);
  }

  stop() {
    if (this.timer) this.timers.clearInterval(this.timer);
    this.timer = 0;
  }

  tick() {
    const at = this.now();
    const span = Math.max(0, at - (this.lastTick ?? at));
    this.lastTick = at;
    const wasClear = this.clearSince !== null;
    if (this.covered()) {
      this.clearSince = null;
    } else {
      if (!wasClear) this.clearSince = at;
      else for (const row of this.shown) row.left -= span;
    }
    this.shown = this.shown.flatMap((row) => {
      // The phone layer removes the toast when it switches off. Show it again on the desktop HUD; keep the clock.
      if (row.element?.isConnected === false) {
        const element = this.present(row.text);
        return [element ? { ...row, element } : row];
      }
      if (row.left > 0) return [row];
      this.retire(row.element);
      return [];
    });
    if (this.held.length && this.clearSince !== null && at - this.clearSince >= this.clearMs) {
      for (const text of this.held) this.shown.push({ text, element: this.present(text), left: this.readMs });
      this.held = [];
    }
    if (!this.held.length && !this.shown.length) this.stop();
  }

  clear() {
    for (const row of this.shown) this.retire(row.element);
    this.shown = [];
    this.held = [];
    this.stop();
  }

  dispose() {
    this.clear();
  }
}
