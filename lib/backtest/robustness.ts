/**
 * Robustness of a replay's trade list: walk-forward windows, stress windows
 * and market-regime splits (Q2 "Prove the edge", `docs/SYNTHESIZED_ROADMAP.md`
 * Part 4; added 2026-10-28). The Monte Carlo of the same trade list is built
 * separately, by another thread.
 *
 * The replay (`replay.ts`) produces the trades and `run.ts` /
 * `scripts/backtest-universe.mjs` report their expectancy with a bootstrap CI
 * and two chronological halves. Those answer "is the average above zero". They
 * do not answer whether it holds through time and through changed markets:
 *
 * - Does it hold quarter after quarter, or is the average carried by one
 *   spell? (`walkForward`: calendar quarters in order, and the score cutoff
 *   chosen on the trades that had closed before each quarter began, measured
 *   on that quarter alone.)
 * - How did it do when the market broke? (`stressWindows`.)
 * - Does it depend on the market's trend? (`regimeSplit`.)
 *
 * `buildRobustness` reads them all on the closed trades the score chose
 * (open-at-end and derived trades apart, as `computeClosedSummary` and the
 * universe summary's scopes keep them). Pure and unit-testable against a fixed
 * trade list, the same split as `metrics.ts` and `attribution.ts`. Nothing here
 * changes a trade, a score or a verdict, so `STRATEGY_VERSION` is untouched.
 *
 * Three-question basis:
 * 1. Gann. He judged a method by the trades it would have made, losses
 *    included, kept over years (the trade records in *Truth of the Stock Tape*
 *    and *45 Years*), and he read every market against the main trend
 *    ("never buck the trend", never-failing rule 5). So the regime split reads
 *    the market's trend with his own trend reading (`readGannTrend`) and splits
 *    trades with it from those against it. The score cutoff is no Gann figure
 *    ("The scorecard's role", AGENTS.md): a display decision measurement may
 *    move, which is why the walk-forward may choose it.
 * 2. Cycles. Dewey's validation standard (`docs/memory-bank/sources/
 *    C06_dewey_case_for_cycles.md`) asks for persistence through changed
 *    conditions and persistence after discovery. The regime split and the
 *    stress windows are the first; the walk-forward, where each quarter is
 *    read only with what had closed before it, is the second. No periodicity
 *    claim is made here, so the seven-item checklist does not otherwise apply.
 * 3. Hermetic. Rhythm: a method that works only in one phase of the market's
 *    swing is a phase, not a method, and these splits are how that shows.
 *    Cause and Effect: each window's result is read against the conditions it
 *    met, not pooled away.
 *
 * Limits: the stress windows are named engineering choices, and the regime
 * reading uses the market index the caller passes (SPY in the scripts), read
 * on the closed sessions before each trade's date. Every section places a
 * trade by the day it opened. A trade the replay ended at its session limit
 * (`held_to_limit`) is valued at that bar's close, not at a realised exit, as
 * `metrics.ts` says; `buildRobustness` counts them so the report can say so.
 */

import type { Bar } from "@/lib/types";
import { readGannTrend } from "@/lib/gann/trendStrength";
import { bootstrapMeanCI95 } from "@/lib/backtest/metrics";
import { EXECUTE_SCORE_THRESHOLD } from "@/lib/scoring/weights";

/** The fields this module reads. `ReplayTrade` satisfies it. */
export interface RobustTrade {
  /** ISO stamp of the bar the trade opened on. */
  openedAt: string;
  /** ISO stamp of the bar it left on; absent on records built before the field. */
  closedAt?: string;
  rMultiple: number;
  direction: "bullish" | "bearish";
  /** `open_at_end` for a trade still open when the data ended (R marked, not realised). */
  exitReason?: string;
  /** The whole-point score out of 9; absent on a derived trade. */
  score?: number;
  /** The verdict the scan would have shown. */
  outputState?: string;
  /** Set on a reversal or re-entry the replay opened from another trade. */
  derived?: string;
}

export interface WindowStat {
  n: number;
  expectancyR: number | null;
  expectancyCI95: [number, number] | null;
  winRate: number | null;
  totalR: number;
}

function describe(rs: number[]): WindowStat {
  const finite = rs.filter((r) => Number.isFinite(r));
  const n = finite.length;
  const totalR = finite.reduce((s, r) => s + r, 0);
  return {
    n,
    expectancyR: n > 0 ? totalR / n : null,
    expectancyCI95: bootstrapMeanCI95(finite, 2000),
    winRate: n > 0 ? finite.filter((r) => r > 0).length / n : null,
    totalR,
  };
}

/** New York calendar date of an ISO stamp (`YYYY-MM-DD`). */
export function nyDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** The calendar quarter a date falls in, e.g. `2024-Q3`. */
export function quarterOf(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}

/** The first date of a quarter key, e.g. `2024-Q3` → `2024-07-01`. */
export function quarterStart(key: string): string {
  const [y, q] = key.split("-Q").map(Number);
  return `${y}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`;
}

const isOpenAtEnd = (t: RobustTrade) => t.exitReason === "open_at_end";

// ---------------------------------------------------------------------------
// Walk-forward

/** Score cutoffs the walk-forward may choose from (Watch's floor up to the full 9). */
export const CUTOFF_CANDIDATES = [4, 5, 6, 7, 8, 9] as const;

export interface WalkForwardWindow extends WindowStat {
  window: string;
  /** Scored, non-derived trades scoring at least the fixed cutoff (a score filter, not the Execute verdict). */
  fixedCutoff: WindowStat;
  /** The trades the scan called Execute (the cutoff plus every hold the verdict applies). */
  execute: WindowStat;
  /** The cutoff chosen on the trades closed before this quarter (null when too few had closed). */
  chosenCutoff: number | null;
  /** This quarter's trades at the chosen cutoff: out of sample. */
  chosen: WindowStat | null;
}

export interface WalkForwardReport {
  /** The fixed score cutoff compared against (`EXECUTE_SCORE_THRESHOLD` by default). */
  fixedCutoff: number;
  windows: WalkForwardWindow[];
  /**
   * Quarters whose expectancy over all their trades (not the chosen cutoff's
   * out-of-sample trades) was above zero, of those with any trades.
   */
  positiveWindows: { positive: number; of: number };
  /** The longest run of consecutive quarters whose all-trade expectancy was at or below zero. */
  longestLosingRun: number;
  /** Every out-of-sample trade the chosen cutoffs took, pooled. */
  outOfSample: WindowStat;
  /** The same quarters' trades at the fixed score cutoff, for comparison. */
  fixedOnSameWindows: WindowStat;
}

export interface WalkForwardOptions {
  /** Fewest in-sample trades a cutoff needs before it can be chosen. */
  minInSample?: number;
  fixedCutoff?: number;
}

const isScored = (t: RobustTrade): t is RobustTrade & { score: number } =>
  !t.derived && typeof t.score === "number" && Number.isFinite(t.score);

/**
 * Anchored walk-forward over calendar quarters. For each quarter the score
 * cutoff with the best expectancy over the scored trades that had closed
 * before the quarter's first day (at least `minInSample` of them) is chosen,
 * and only this quarter's trades are measured with it, so nothing realised
 * inside the quarter informs its own cutoff. A trade with no close stamp, or
 * still open when the data ended, is never in sample. Ties go to the higher
 * cutoff (fewer, stronger setups).
 *
 * Called directly, it reads every trade it is given: each quarter's own
 * figures (`n`, expectancy, `positiveWindows`, `longestLosingRun`) include
 * derived and open-at-end trades if they are passed in. Only the in-sample
 * set and the score filters leave them out. `buildRobustness` passes the
 * closed, non-derived trades alone.
 */
export function walkForward(trades: RobustTrade[], opts: WalkForwardOptions = {}): WalkForwardReport {
  const minInSample = opts.minInSample ?? 30;
  const fixed = opts.fixedCutoff ?? EXECUTE_SCORE_THRESHOLD;

  const byWindow = new Map<string, RobustTrade[]>();
  for (const t of trades) {
    const key = quarterOf(nyDate(t.openedAt));
    const list = byWindow.get(key);
    if (list) list.push(t);
    else byWindow.set(key, [t]);
  }
  const keys = [...byWindow.keys()].sort();
  const known = trades
    .filter((t) => isScored(t) && !isOpenAtEnd(t) && t.closedAt && Number.isFinite(t.rMultiple))
    .map((t) => ({ score: t.score as number, r: t.rMultiple, closed: nyDate(t.closedAt as string) }));

  const windows: WalkForwardWindow[] = [];
  const oos: number[] = [];
  const fixedSame: number[] = [];
  for (const key of keys) {
    const list = byWindow.get(key)!;
    const scored = list.filter(isScored);
    const start = quarterStart(key);
    const prior = known.filter((t) => t.closed < start);

    let chosenCutoff: number | null = null;
    let best = -Infinity;
    for (const c of CUTOFF_CANDIDATES) {
      const rs = prior.filter((t) => t.score >= c).map((t) => t.r);
      if (rs.length < minInSample) continue;
      const m = rs.reduce((s, r) => s + r, 0) / rs.length;
      if (m >= best) {
        best = m;
        chosenCutoff = c;
      }
    }
    const fixedRs = scored.filter((t) => t.score >= fixed).map((t) => t.rMultiple);
    let chosen: WindowStat | null = null;
    if (chosenCutoff !== null) {
      const rs = scored.filter((t) => t.score >= chosenCutoff!).map((t) => t.rMultiple);
      chosen = describe(rs);
      oos.push(...rs);
      fixedSame.push(...fixedRs);
    }
    windows.push({
      window: key,
      ...describe(list.map((t) => t.rMultiple)),
      fixedCutoff: describe(fixedRs),
      execute: describe(list.filter((t) => !t.derived && t.outputState === "Execute").map((t) => t.rMultiple)),
      chosenCutoff,
      chosen,
    });
  }

  const traded = windows.filter((w) => w.n > 0);
  let run = 0;
  let longestLosingRun = 0;
  for (const w of traded) {
    run = (w.expectancyR ?? 0) <= 0 ? run + 1 : 0;
    longestLosingRun = Math.max(longestLosingRun, run);
  }
  return {
    fixedCutoff: fixed,
    windows,
    positiveWindows: { positive: traded.filter((w) => (w.expectancyR ?? 0) > 0).length, of: traded.length },
    longestLosingRun,
    outOfSample: describe(oos),
    fixedOnSameWindows: describe(fixedSame),
  };
}

// ---------------------------------------------------------------------------
// Stress windows

export interface StressWindow {
  label: string;
  /** Inclusive New York dates. */
  from: string;
  to: string;
}

/**
 * Named market stress spells on SPY's closes, one rule for each: from the
 * first session after the high close to the low close, inclusive (the 2020
 * rebound runs from the session after the crash's low close). A trade counts
 * in a window by the day it opened, wherever it closed. Engineering choices,
 * labelled: the spells are the index's own turns, and no Gann source names
 * them. Checked 2026-10-29 against SPY's daily closes (SIP feed).
 */
export const DEFAULT_STRESS_WINDOWS: readonly StressWindow[] = [
  { label: "Q4 2018 selloff", from: "2018-09-21", to: "2018-12-24" },
  { label: "2020 crash", from: "2020-02-20", to: "2020-03-23" },
  { label: "2020 rebound", from: "2020-03-24", to: "2020-06-08" },
  { label: "2022 bear market", from: "2022-01-04", to: "2022-10-12" },
  { label: "March 2023 bank stress", from: "2023-03-07", to: "2023-03-13" },
  { label: "August 2024 unwind", from: "2024-07-17", to: "2024-08-05" },
  { label: "2025 tariff decline", from: "2025-02-20", to: "2025-04-08" },
];

export interface StressRow extends WindowStat {
  label: string;
  from: string;
  to: string;
  longs: WindowStat;
  shorts: WindowStat;
}

export function stressWindows(trades: RobustTrade[], windows: readonly StressWindow[] = DEFAULT_STRESS_WINDOWS): StressRow[] {
  return windows.map((w) => {
    const inside = trades.filter((t) => {
      const d = nyDate(t.openedAt);
      return d >= w.from && d <= w.to;
    });
    return {
      label: w.label,
      from: w.from,
      to: w.to,
      ...describe(inside.map((t) => t.rMultiple)),
      longs: describe(inside.filter((t) => t.direction === "bullish").map((t) => t.rMultiple)),
      shorts: describe(inside.filter((t) => t.direction === "bearish").map((t) => t.rMultiple)),
    };
  });
}

// ---------------------------------------------------------------------------
// Market regimes

export type MarketTrend = "up" | "down" | "none";

/** Inclusive New York dates (`YYYY-MM-DD`). */
export interface DateSpan {
  from: string;
  to: string;
}

const inSpan = (date: string, span: DateSpan) => date >= span.from && date <= span.to;

/** The New York dates the trades opened on, first to last; null with no trades. */
export function openSpan(trades: RobustTrade[]): DateSpan | null {
  if (trades.length === 0) return null;
  const dates = trades.map((t) => nyDate(t.openedAt)).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}

/**
 * The market's Gann trend on each session, read on the sessions before it
 * (closed bars only, so a trade opened that day could have known it): the
 * weekly chart's trend confirmed by stepping 3-Day Chart swings, as the scan
 * reads every trend (`readGannTrend`). Keyed by New York date. `lookback`
 * bars are read each time (two years by default, ample for both charts).
 * `span`, inclusive New York dates, limits the sessions read to the trades'
 * own (each still reads its full lookback before it), since a market record
 * is often years longer than the run.
 */
export function marketTrendByDate(bars: Bar[], lookback = 520, span?: DateSpan): Map<string, MarketTrend> {
  const out = new Map<string, MarketTrend>();
  for (let i = 1; i < bars.length; i++) {
    if (span && !inSpan(nyDate(bars[i].t), span)) continue;
    const read = readGannTrend(bars.slice(Math.max(0, i - lookback), i));
    out.set(nyDate(bars[i].t), read.direction === "bullish" ? "up" : read.direction === "bearish" ? "down" : "none");
  }
  return out;
}

/**
 * Whether the market stood 10% or more under its highest close of the year
 * before each session (read on the sessions before it). Engineering choice,
 * labelled: the common measure of a market correction, not a Gann figure.
 */
export function marketDrawdownByDate(bars: Bar[], depth = 0.1, lookback = 252, span?: DateSpan): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (let i = 1; i < bars.length; i++) {
    if (span && !inSpan(nyDate(bars[i].t), span)) continue;
    let high = -Infinity;
    for (let k = Math.max(0, i - lookback); k < i; k++) high = Math.max(high, bars[k].c);
    out.set(nyDate(bars[i].t), bars[i - 1].c <= high * (1 - depth));
  }
  return out;
}

export interface RegimeSplit {
  /** By the market's trend: up, down, none, and unknown when the date has no reading. */
  byTrend: Record<string, WindowStat>;
  /** Trades with the market's trend, against it, or with no trend to be with. */
  withMarket: Record<"with" | "against" | "none", WindowStat>;
  /** In a market correction (10% under the year's high) or not. */
  byCorrection: Record<"correction" | "normal" | "unknown", WindowStat>;
}

export function regimeSplit(
  trades: RobustTrade[],
  trendByDate: Map<string, MarketTrend>,
  correctionByDate?: Map<string, boolean>,
): RegimeSplit {
  const groups = <K extends string>(keyOf: (t: RobustTrade) => K, keys: readonly K[]): Record<K, WindowStat> => {
    const buckets = Object.fromEntries(keys.map((k) => [k, [] as number[]])) as Record<K, number[]>;
    for (const t of trades) buckets[keyOf(t)].push(t.rMultiple);
    return Object.fromEntries(keys.map((k) => [k, describe(buckets[k])])) as Record<K, WindowStat>;
  };
  const trendOf = (t: RobustTrade) => trendByDate.get(nyDate(t.openedAt)) ?? "unknown";
  return {
    byTrend: groups(trendOf, ["up", "down", "none", "unknown"] as const),
    withMarket: groups((t) => {
      const m = trendOf(t);
      if (m !== "up" && m !== "down") return "none";
      return (m === "up") === (t.direction === "bullish") ? "with" : "against";
    }, ["with", "against", "none"] as const),
    byCorrection: groups((t) => {
      const c = correctionByDate?.get(nyDate(t.openedAt));
      return c === undefined ? "unknown" : c ? "correction" : "normal";
    }, ["correction", "normal", "unknown"] as const),
  };
}

// ---------------------------------------------------------------------------
// Everything at once

export interface RobustnessReport {
  /** Closed, scored-or-armed trades the sections read (open-at-end and derived trades apart). */
  n: number;
  /** Trades still open when the data ended, left out of every section (their R is marked). */
  openAtEnd: number;
  /** Of `n`, trades ended at the session limit: in every section, valued at that bar's close. */
  heldToLimit: number;
  /** Reversals and re-entries the replay opened from other trades, apart from the sections. */
  derived: WindowStat;
  walkForward: WalkForwardReport;
  stress: StressRow[];
  /** Null when no market bars were given. */
  regimes: RegimeSplit | null;
}

/**
 * The walk-forward, stress windows and regime split on a cell's trades. The
 * sections read the closed trades the replay armed itself; trades still open
 * when the data ended are counted and left out (their R is marked, not
 * realised), and derived trades are reported on their own, as the universe
 * summary's scopes keep them. `market` is the index's daily bars (SPY).
 */
// The market readings by bar array and trade span: reading SPY's trend takes
// seconds over a decade, and a universe run's cells usually share one span.
const marketReadings = new WeakMap<Bar[], Map<string, [Map<string, MarketTrend>, Map<string, boolean>]>>();

function readMarket(market: Bar[], span: DateSpan): [Map<string, MarketTrend>, Map<string, boolean>] {
  let bySpan = marketReadings.get(market);
  if (!bySpan) marketReadings.set(market, (bySpan = new Map()));
  const key = `${span.from}|${span.to}|${market.length}`;
  let read = bySpan.get(key);
  if (!read) bySpan.set(key, (read = [marketTrendByDate(market, 520, span), marketDrawdownByDate(market, 0.1, 252, span)]));
  return read;
}

export function buildRobustness(trades: RobustTrade[], market?: Bar[]): RobustnessReport {
  const armed = trades.filter((t) => !t.derived && !isOpenAtEnd(t));
  const span = openSpan(armed);
  return {
    n: armed.length,
    openAtEnd: trades.filter(isOpenAtEnd).length,
    heldToLimit: armed.filter((t) => t.exitReason === "held_to_limit").length,
    derived: describe(trades.filter((t) => t.derived && !isOpenAtEnd(t)).map((t) => t.rMultiple)),
    walkForward: walkForward(armed),
    stress: stressWindows(armed),
    regimes:
      market && market.length > 1 && span
        ? regimeSplit(armed, ...readMarket(market, span))
        : null,
  };
}
