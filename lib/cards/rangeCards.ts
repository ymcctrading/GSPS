/**
 * The platform's two range cards, read on the last completed daily bar:
 *
 * - "rangeLow" (every tier): a held 1st to 3rd test of the 20-session low on
 *   an active stock. Buy at the next open; stop 3 points under the low; TP1
 *   the 20-session top; MTP the top of the year before the range (a runner's
 *   target, with its stop at breakeven once TP1 is reached).
 * - "rangeBreakout" (Expert and Wall Street, a labelled higher-risk alert):
 *   the first close a point over the 20-session top on an active stock. Buy
 *   the reaction to that line (a buy limit, up to 10 sessions); stop 3 points
 *   under the old top; TP1 the nearest earlier swing top at least 1R away;
 *   MTP the top of the year before the range.
 *
 * Server only: read by /api/cards/nightly. Members see only the levels, the
 * kind's neutral label and its record (lib/setups/cardRecords.ts).
 *
 * The rules are the frozen research rules ported one for one (internal:
 * private-research/whale-engine/, whale2.py `events` and `trade`, whale3.py
 * `levels` and `exits`, the active filter of whale5r.py R3 as WHALE7 and
 * forward/fwd_remora.py read it, and whale9.py `events`, `tp1_for` and
 * `manage`); `__tests__/rangeCards.test.ts` holds the port to the scripts'
 * conditions. Nothing here is fitted on new data.
 *
 * Record (internal: RESULT-WHALE7-HOLDOUT.md, RESULT-WHALE9.md, and the card
 * form in whale-engine/cards/): the range-low trade made +72 bp a trade on 248
 * held-out stocks (6,417 trades, 2019-2026), beating random entries in the same
 * stock and month by about 195 bp, with a 95% interval just touching zero, so
 * it is a lead under a forward record, not a proven edge. The breakout was not
 * profitable by week in 2019-23 and lost to random entries with the same
 * levels, which is why it is shown only as a labelled higher-risk alert
 * (owner, 2026-11-12 16:40 UTC) until the forward record backs it.
 *
 * Mandate questions (private topic file 14):
 * 1. Method: the retest of a bottom that holds is a buying point and the stop
 *    goes 3 points under it (ref: SRC-004 pp.20, 39, 46-47; ref: SRC-001
 *    pp.240-241; a retest on lighter volume, ref: SRC-003 Ch. VII); old tops
 *    are the objective and where selling comes (ref: SRC-004 pp.13, 22, 40);
 *    trade active stocks and leave the dead ones alone (ref: SRC-004 pp.20,
 *    34-35); after a top is crossed, buy the reaction with the stop under the
 *    old top (ref: SRC-004 pp.13, 20, 22, 46-47). Tier A, as cited.
 * 2. Cycles: no periodicity claim. Time enters only as the range's 20
 *    sessions, the year's top and the runner's 60 sessions, all fixed before
 *    any held-out read (the cycles literature's persistence criterion).
 * 3. Principles: Polarity (the same range read from both ends: the patient
 *    retest of the low for every member, the active cross of the top for
 *    the members who carry more risk) and Rhythm (one trade a stock at a
 *    time; the next only after the last resolves).
 * 4. Creation: the range's low (accumulation) paired with the year's top
 *    (distribution) as the exit: measured a creation over random entries on
 *    held-out stocks (about +195 bp a trade). The breakout's pairing of the
 *    range with the crossing volume measured a mixture (WHALE9), and the card
 *    says so by being an alert.
 */

import type { Bar } from "@/lib/types";
import { pricePoint } from "@/lib/gann/pointScale";

/** The range: the 20 sessions before the signal bar. */
export const RANGE_SESSIONS = 20;
/** The year before the range the MTP is read from (sessions d-270 .. d-21). Also the warm-up before any event. */
export const YEAR_SESSIONS = 270;
/** Tests of one low that count. */
export const MAX_TESTS = 3;
/** Sessions between two counted tests, and the least age of the low. */
export const TEST_GAP = 3;
/** Stop distance in points past the level. */
export const STOP_POINTS = 3;
/** Sessions the first leg (TP1 or the stop) is held, as the frozen entry rule read it. */
export const FIRST_LEG_SESSIONS = 20;
/** Sessions the runner is held at most. */
export const RUNNER_SESSIONS = 60;
/** Sessions the breakout's buy limit waits for the reaction. */
export const BREAKOUT_FILL_SESSIONS = 10;
/** A distribution day: volume at least this many times the 20-session mean, closing under its open. */
export const HEAVY_VOLUME = 1.5;

/**
 * Bars a stock needs for tonight's card to read the same as the research:
 * the warm-up, plus the runner and first leg of any earlier trade still open.
 * The nightly job reads enough calendar days for this (520 days, about 358 sessions).
 */
export const RANGE_MIN_BARS = YEAR_SESSIONS + RUNNER_SESSIONS + 2;

export type RangeKind = "rangeLow" | "rangeBreakout";

export interface RangeCard {
  kind: RangeKind;
  /** rangeLow: the signal close, for reference (the order is at the next open). rangeBreakout: the buy limit. */
  entry: number;
  stop: number;
  tp1: number;
  /** Shown only when above TP1. */
  mtp: number | null;
  /** The bar the event was read on (rangeBreakout: the crossing close; tonight's bar for rangeLow). */
  eventIndex: number;
  /** rangeLow: which test of the low (1-3). */
  test?: number;
}

const max = (a: readonly number[], from: number, to: number) => {
  let m = -Infinity;
  for (let i = Math.max(0, from); i < to; i++) if (a[i] > m) m = a[i];
  return m;
};
const min = (a: readonly number[], from: number, to: number) => {
  let m = Infinity;
  let at = -1;
  for (let i = Math.max(0, from); i < to; i++)
    if (a[i] < m) {
      m = a[i];
      at = i;
    }
  return { m, at };
};

/**
 * Pure. The 20-session mean true range as a share of the close, per bar
 * (NaN until 20 bars). The first bar's true range is its own range.
 */
export function atrPct(bars: readonly Bar[]): number[] {
  const tr = bars.map((b, i) =>
    i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c)),
  );
  const out = new Array<number>(bars.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += tr[i];
    if (i >= RANGE_SESSIONS) sum -= tr[i - RANGE_SESSIONS];
    if (i >= RANGE_SESSIONS - 1) out[i] = sum / RANGE_SESSIONS / bars[i].c;
  }
  return out;
}

/**
 * Pure. Each session's median of `atrPct` across the universe, keyed by the
 * bar's timestamp: the line a stock must be at or above to count as active
 * that day. Stocks without a value that day are left out, as the research's
 * median skipped them.
 */
export function activityMedians(universe: Iterable<readonly Bar[]>): Map<string, number> {
  const byDay = new Map<string, number[]>();
  for (const bars of universe) {
    const a = atrPct(bars);
    for (let i = 0; i < bars.length; i++) {
      if (!Number.isFinite(a[i])) continue;
      const list = byDay.get(bars[i].t);
      if (list) list.push(a[i]);
      else byDay.set(bars[i].t, [a[i]]);
    }
  }
  const out = new Map<string, number>();
  for (const [t, xs] of byDay) {
    xs.sort((x, y) => x - y);
    const n = xs.length;
    out.set(t, n % 2 ? xs[(n - 1) / 2] : (xs[n / 2 - 1] + xs[n / 2]) / 2);
  }
  return out;
}

/** Pure. Whether the stock was active on each bar: its `atrPct` at or above the day's median. */
export function activeFlags(bars: readonly Bar[], medians: ReadonlyMap<string, number>): boolean[] {
  const a = atrPct(bars);
  return bars.map((b, i) => {
    const m = medians.get(b.t);
    return Number.isFinite(a[i]) && m != null && a[i] >= m;
  });
}

interface Cols {
  O: number[];
  H: number[];
  L: number[];
  C: number[];
  V: number[];
}
const cols = (bars: readonly Bar[]): Cols => ({
  O: bars.map((b) => b.o),
  H: bars.map((b) => b.h),
  L: bars.map((b) => b.l),
  C: bars.map((b) => b.c),
  V: bars.map((b) => b.v),
});

/** The first leg as the entry rule read it (whale2 `trade`): the bar it ends on, from an entry at bar `ei`'s open. */
function firstLegEnd(k: Cols, ei: number, stop: number, tgt: number): number {
  const n = k.O.length;
  const last = Math.min(ei + FIRST_LEG_SESSIONS - 1, n - 1);
  for (let i = ei; i <= last; i++) {
    if (i > ei && (k.O[i] <= stop || k.O[i] >= tgt)) return i;
    if (k.L[i] <= stop || k.H[i] >= tgt) return i;
  }
  return last;
}

/**
 * The managed trade (whale3 `exits`, whale9 `manage`): from a fill at bar
 * `fi` and price `e`, the stop or TP1 for half; after TP1 the runner's stop
 * is breakeven, and it exits at MTP, on the first heavy-volume down day that
 * closes above TP1, or after `RUNNER_SESSIONS`. Returns the bar the trade
 * ends on. `limitFill` true for a limit fill (whale9 reads the stop from
 * the bar after); the first leg's horizon is `FIRST_LEG_SESSIONS` for the
 * open fill (whale3) and the runner's for the limit fill (whale9).
 */
function managedEnd(k: Cols, fi: number, e: number, stop: number, tp1: number, mtp: number, limitFill: boolean): number {
  const n = k.O.length;
  const legLast = Math.min(fi + (limitFill ? RUNNER_SESSIONS : FIRST_LEG_SESSIONS) - 1, n - 1);
  let end = legLast;
  let tpAt = -1;
  for (let i = fi; i <= legLast; i++) {
    if (i > fi && k.O[i] <= stop) {
      end = i;
      break;
    }
    if (i > fi && k.O[i] >= tp1) {
      end = tpAt = i;
      break;
    }
    if (k.L[i] <= stop && (!limitFill || i > fi)) {
      end = i;
      break;
    }
    if (k.H[i] >= tp1) {
      end = tpAt = i;
      break;
    }
  }
  if (tpAt < 0) return end;
  const m = mtp > tp1 ? mtp : null;
  const rl = Math.min(fi + RUNNER_SESSIONS - 1, n - 1);
  let ir = rl;
  for (let i = tpAt + 1; i <= rl; i++) {
    const heavy = k.V[i] >= HEAVY_VOLUME * (k.V.slice(i - RANGE_SESSIONS, i).reduce((s, v) => s + v, 0) / RANGE_SESSIONS);
    if (k.O[i] <= e || (m != null && k.O[i] >= m) || k.L[i] <= e || (m != null && k.H[i] >= m) || (heavy && k.C[i] < k.O[i] && k.C[i] > tp1)) {
      ir = i;
      break;
    }
  }
  return Math.max(end, ir);
}

/**
 * Pure. Tonight's range-low card for one stock, or null. `bars` are the
 * completed daily bars oldest first, the last being tonight's; `active` from
 * `activeFlags`. The card is the one the frozen rule would issue at this
 * close: tonight is a held test (low within 1 point of the 20-session low,
 * close back at or above it, the low at least 3 sessions old, the 1st to 3rd
 * counted test, tests at least 3 sessions apart), the stock is active, the
 * close sits between the stop and TP1 (the next open stands in for it until
 * it trades), no earlier first leg is still running, and no earlier active
 * trade's runner is still open.
 */
export function rangeLowCard(bars: readonly Bar[], active: readonly boolean[]): RangeCard | null {
  const n = bars.length;
  if (n < RANGE_MIN_BARS) return null;
  const k = cols(bars);
  const t = n - 1;
  const tests = new Map<number, number[]>();
  let flatFrom = 0;
  let busyUntil = -1;
  for (let d = YEAR_SESSIONS; d <= t; d++) {
    const { m: L0, at: j } = min(k.L, d - RANGE_SESSIONS, d);
    if (j > d - TEST_GAP) continue;
    if (!(k.L[d] <= L0 + pricePoint(L0) && k.C[d] >= L0)) continue;
    const prev = tests.get(j) ?? [];
    tests.set(j, prev);
    if (prev.length && d - prev[prev.length - 1] < TEST_GAP) continue;
    prev.push(d);
    const test = prev.length;
    if (test > MAX_TESTS || d < flatFrom) continue;
    const stop = L0 - STOP_POINTS * pricePoint(L0);
    const tp1 = max(k.H, d - RANGE_SESSIONS, d);
    const mtp = max(k.H, d - YEAR_SESSIONS, d - RANGE_SESSIONS);
    if (d === t) {
      // Tonight: the next open stands in as the signal close (fwd_remora `tonight`).
      const e = k.C[t];
      if (!(e > 0) || stop >= e || tp1 <= e) return null;
      if (!active[t] || busyUntil >= t) return null;
      return { kind: "rangeLow", entry: e, stop, tp1, mtp: mtp > tp1 ? mtp : null, eventIndex: t, test };
    }
    const e = k.O[d + 1];
    if (!(e > 0) || stop >= e || tp1 <= e) continue;
    flatFrom = firstLegEnd(k, d + 1, stop, tp1) + 1;
    if (active[d]) {
      const end = managedEnd(k, d + 1, e, stop, tp1, mtp, false);
      // An exit on tonight's bar or later is still open at this close (fwd_remora: closed only when it ended before the last bar).
      if (end >= t) busyUntil = Math.max(busyUntil, t);
    }
  }
  return null;
}

/** whale9 `tp1_for`: the nearest earlier swing top (a 5-bar high) above entry + 1R, else entry plus the range's height. */
function breakoutTp1(H: readonly number[], d: number, e: number, stop: number, top: number, bottom: number): number {
  const need = e + (e - stop);
  let best: number | null = null;
  for (let i = Math.max(2, d - YEAR_SESSIONS); i < d - (RANGE_SESSIONS + 2); i++) {
    if (H[i] === max(H, i - 2, i + 3) && H[i] > need && (best == null || H[i] < best)) best = H[i];
  }
  return best ?? e + (top - bottom);
}

/**
 * Pure. Tonight's breakout alert for one stock, or null: a buy limit at the
 * line a point over the old range top, for the next session, while the
 * crossing's 10-session window is open, nothing has filled, and no close has
 * fallen under the stop since the cross. One trade a stock at a time: a cross
 * while an earlier filled trade is running is not read (whale9 `flat`).
 * Where two crossings are both still waiting, the later one is the card.
 */
export function rangeBreakoutCard(bars: readonly Bar[], active: readonly boolean[]): RangeCard | null {
  const n = bars.length;
  if (n < RANGE_MIN_BARS) return null;
  const k = cols(bars);
  const t = n - 1;
  let flat = 0;
  let card: RangeCard | null = null;
  for (let d = YEAR_SESSIONS; d <= t; d++) {
    if (d < flat || !active[d]) continue;
    const top = max(k.H, d - RANGE_SESSIONS, d);
    const bottom = min(k.L, d - RANGE_SESSIONS, d).m;
    const pt = pricePoint(top);
    const line = top + pt;
    const prevTop = max(k.H, d - RANGE_SESSIONS - 1, d - 1);
    if (!(k.C[d] >= line && k.C[d - 1] < prevTop + pricePoint(prevTop))) continue;
    const stop = top - STOP_POINTS * pt;
    const mtp = max(k.H, d - YEAR_SESSIONS, d - RANGE_SESSIONS);
    let fi = -1;
    let e = 0;
    let cancelled = false;
    const lastFill = Math.min(d + BREAKOUT_FILL_SESSIONS, t);
    for (let i = d + 1; i <= lastFill; i++) {
      if (k.O[i] <= line) {
        fi = i;
        e = k.O[i];
        break;
      }
      if (k.L[i] <= line) {
        fi = i;
        e = line;
        break;
      }
      if (k.C[i] < stop) {
        cancelled = true;
        break;
      }
    }
    if (fi >= 0) {
      if (e <= stop) continue;
      const tp1 = breakoutTp1(k.H, d, e, stop, top, bottom);
      flat = managedEnd(k, fi, e, stop, tp1, mtp, true) + 1;
      if (flat > t) card = null;
      continue;
    }
    // Unfilled: still on offer tomorrow if the window reaches it and no close fell under the stop.
    if (!cancelled && d + BREAKOUT_FILL_SESSIONS > t && k.C[t] >= stop) {
      const tp1 = breakoutTp1(k.H, d, line, stop, top, bottom);
      card = { kind: "rangeBreakout", entry: line, stop, tp1, mtp: mtp > tp1 ? mtp : null, eventIndex: d };
    }
  }
  if (card && flat > t) return null;
  return card;
}
