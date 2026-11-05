/**
 * The corrected first-lot entry comparison (edge isolation handoff, task 1b).
 * Measurement only. Versioned apart from slice 1's `controls.ts`, which stays
 * exactly as it was so the original 200-draw result can be reproduced.
 *
 * Slice 1's control was a retrospective diagnostic. It held each random entry
 * for the real campaign's realised length (known only after the fact), one
 * session shorter than the campaign (`i + held − 1` against the core's
 * `exit − entry`), and set it against the real campaign's whole pyramided,
 * trailed R. This one fixes the policy at entry and applies it to both arms:
 *
 * - **Both arms, one policy.** One lot, the stop share of the real campaign's
 *   entry, held `horizon` sessions after the entry session (the exit session
 *   is entry + horizon, the core's own convention), out at the stop when a
 *   bar trades through it (at the open when it gaps through), else at the
 *   horizon session's close. The actual arm is the real entry session at the
 *   real fill and stop; the control arm is a random session within
 *   ±`windowSessions` at that session's open with the same stop share.
 * - **Horizons fixed before outcomes:** 10, 21 and 63 sessions by default,
 *   engineering choices (about two weeks, a month, a quarter), labelled.
 * - **Same filters.** A campaign is used only when both arms can run the full
 *   horizon inside the data (censored campaigns are counted, not truncated).
 *   Near a series edge the window narrows, down to the actual session; those
 *   campaigns are counted (`narrowed`).
 *   Membership is approximated, as in slice 1: the control session lies within
 *   ±21 sessions of a date the symbol was a member; it is not checked itself.
 * - **The entry session's own bar.** For both arms the stop is checked on the
 *   entry session's range too (conservative for the actual arm, whose
 *   crossing fills came intraday).
 * - **Uncertainty.** Per campaign, actual R minus the mean of its control
 *   draws; the mean of those paired differences gets a month-block bootstrap
 *   (campaigns grouped by opening month, months resampled in blocks of three)
 *   so calendar-time dependence across overlapping campaigns is kept.
 *
 * What this measures: whether the core's entry date, given the symbol and side
 * it chose, beats a nearby random date under identical management. It is a
 * conditional date test, not a test of stock selection.
 *
 * Design basis (AGENTS.md mandate). Gann: measurement, no rule. Cycles: Dewey's
 * base rate against the claim. Hermetic: Polarity. Law of Creation: entry ⊗
 * management; this holds management fixed to see the entry alone.
 */

import { seededRandom } from "@/lib/backtest/selectionBias";

export const FIXED_HORIZON_CONTROL_VERSION = "fixed-horizon-1";

export interface HBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface HCampaign {
  symbol: string;
  openedAt: string;
  entry: number;
  stop: number;
  side?: "long" | "short";
  direction?: "bullish" | "bearish";
}

export interface FixedTrade {
  entryIndex: number;
  exitIndex: number;
  entry: number;
  stop: number;
  exitPrice: number;
  exitReason: "stop" | "horizon";
  rMultiple: number;
}

/** One lot from session `i` at `fill`, held `horizon` sessions after it; null when the bars can't carry the whole horizon. */
export function fixedHorizonTrade(bars: readonly HBar[], i: number, dir: 1 | -1, fill: number, stop: number, horizon: number, costPerShare: number): FixedTrade | null {
  if (!(Number.isInteger(horizon) && horizon >= 1)) throw new Error("fixedHorizonTrade: horizon must be a whole number >= 1");
  if (i < 0 || i + horizon >= bars.length || !(fill > 0) || !(dir * (fill - stop) > 0)) return null;
  const last = i + horizon;
  for (let k = i; k <= last; k++) {
    const b = bars[k];
    if (k > i && dir * (b.o - stop) <= 0) return done(k, b.o, "stop");
    if (dir * ((dir === 1 ? b.l : b.h) - stop) <= 0) return done(k, stop, "stop");
  }
  return done(last, bars[last].c, "horizon");

  function done(k: number, exitPrice: number, exitReason: FixedTrade["exitReason"]): FixedTrade {
    return { entryIndex: i, exitIndex: k, entry: fill, stop, exitPrice, exitReason, rMultiple: (dir * (exitPrice - fill) - costPerShare) / Math.abs(fill - stop) };
  }
}

const sideOf = (c: HCampaign): 1 | -1 => (c.side ? (c.side === "short" ? -1 : 1) : c.direction === "bearish" ? -1 : 1);
const dayOf = (iso: string) => iso.slice(0, 10);

function indexOn(bars: readonly HBar[], iso: string): number {
  const d = dayOf(iso);
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dayOf(bars[mid].t) < d) lo = mid + 1;
    else hi = mid;
  }
  return lo < bars.length && dayOf(bars[lo].t) === d ? lo : -1;
}

export interface HorizonResult {
  horizon: number;
  used: number;
  censored: number;
  missing: number;
  /** Used campaigns whose window was narrowed at a series edge (a window of 0 draws the actual session itself). */
  narrowed: number;
  actualMeanR: number;
  controlMeanR: { p05: number; p50: number; p95: number };
  /** Share of draws whose mean R is at or above the actual arm's, with the add-one rank. */
  shareAtOrAboveActual: number;
  /** Paired: actual R − the mean of that campaign's control draws. */
  pairedDiff: { mean: number; lo: number; hi: number; shareAtOrBelowZero: number; months: number };
}

export interface FixedHorizonOptions {
  horizons?: number[];
  draws?: number;
  windowSessions?: number;
  costPerShare?: number;
  seed?: number;
  resamples?: number;
}

/** Month-block bootstrap of a mean over values grouped by month (blocks of `block` consecutive months). */
export function monthBlockBootstrap(byMonth: ReadonlyArray<{ month: string; values: number[] }>, { block = 3, resamples = 2000, seed = 20261105, alpha = 0.05 } = {}) {
  const months = [...byMonth].sort((a, b) => (a.month < b.month ? -1 : 1));
  const m = months.length;
  const all = months.flatMap((x) => x.values);
  const mean = all.length ? all.reduce((s, v) => s + v, 0) / all.length : NaN;
  if (m === 0) return { mean, lo: NaN, hi: NaN, shareAtOrBelowZero: NaN, months: 0 };
  const rand = seededRandom(seed);
  const stats: number[] = [];
  const b = Math.max(1, Math.min(m, block));
  for (let s = 0; s < resamples; s++) {
    let sum = 0;
    let n = 0;
    let picked = 0;
    while (picked < m) {
      const start = Math.floor(rand() * m);
      for (let k = 0; k < b && picked < m; k++, picked++) {
        for (const v of months[(start + k) % m].values) {
          sum += v;
          n++;
        }
      }
    }
    stats.push(n ? sum / n : 0);
  }
  stats.sort((x, y) => x - y);
  const q = (p: number) => stats[Math.min(stats.length - 1, Math.floor(p * stats.length))];
  return { mean, lo: q(alpha / 2), hi: q(1 - alpha / 2), shareAtOrBelowZero: stats.filter((x) => x <= 0).length / stats.length, months: m };
}

export function runFixedHorizonControl(
  campaigns: readonly HCampaign[],
  barsBySymbol: ReadonlyMap<string, readonly HBar[]>,
  { horizons = [10, 21, 63], draws = 200, windowSessions = 21, costPerShare = 0.02, seed = 20261105, resamples = 2000 }: FixedHorizonOptions = {},
): { version: string; horizons: HorizonResult[] } {
  if (!(Number.isInteger(draws) && draws >= 1)) throw new Error("runFixedHorizonControl: draws must be a whole number >= 1");
  const out: HorizonResult[] = [];
  for (const horizon of horizons) {
    const rand = seededRandom(seed + horizon);
    const drawSums = new Array<number>(draws).fill(0);
    let used = 0;
    let censored = 0;
    let missing = 0;
    let narrowed = 0;
    let actualSum = 0;
    const diffsByMonth = new Map<string, number[]>();
    for (const c of campaigns) {
      const bars = barsBySymbol.get(c.symbol);
      const i = bars ? indexOn(bars, c.openedAt) : -1;
      const share = c.entry > 0 ? Math.abs(c.entry - c.stop) / c.entry : NaN;
      if (!bars || i < 0 || !(share > 0 && share < 1)) {
        missing++;
        continue;
      }
      const dir = sideOf(c);
      const actual = fixedHorizonTrade(bars, i, dir, c.entry, c.stop, horizon, costPerShare);
      // A symmetric window, narrowed so every control session can also run the full horizon.
      const w = Math.min(windowSessions, i, bars.length - 1 - horizon - i);
      if (!actual || !Number.isFinite(actual.rMultiple) || w < 0) {
        censored++;
        continue;
      }
      const rs: number[] = [];
      for (let d = 0; d < draws; d++) {
        const k = i - w + Math.floor(rand() * (2 * w + 1));
        const fill = bars[k].o;
        const ctl = fixedHorizonTrade(bars, k, dir, fill, fill * (1 - dir * share), horizon, costPerShare);
        rs.push(ctl ? ctl.rMultiple : NaN);
      }
      if (rs.some((r) => !Number.isFinite(r))) {
        censored++;
        continue;
      }
      used++;
      if (w < windowSessions) narrowed++;
      actualSum += actual.rMultiple;
      rs.forEach((r, d) => (drawSums[d] += r));
      const month = dayOf(c.openedAt).slice(0, 7);
      if (!diffsByMonth.has(month)) diffsByMonth.set(month, []);
      diffsByMonth.get(month)!.push(actual.rMultiple - rs.reduce((s, r) => s + r, 0) / rs.length);
    }
    const actualMean = used ? actualSum / used : NaN;
    const means = drawSums.map((s) => (used ? s / used : NaN)).sort((a, b) => a - b);
    const q = (p: number) => (used ? means[Math.min(means.length - 1, Math.floor(p * means.length))] : NaN);
    const boot = monthBlockBootstrap([...diffsByMonth].map(([month, values]) => ({ month, values })), { resamples, seed: seed + horizon });
    out.push({
      horizon,
      used,
      censored,
      missing,
      narrowed,
      actualMeanR: actualMean,
      controlMeanR: { p05: q(0.05), p50: q(0.5), p95: q(0.95) },
      shareAtOrAboveActual: used ? (means.filter((m) => m >= actualMean).length + 1) / (means.length + 1) : NaN,
      pairedDiff: boot,
    });
  }
  return { version: FIXED_HORIZON_CONTROL_VERSION, horizons: out };
}
