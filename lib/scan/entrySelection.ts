/**
 * What the live scan arms and prices a trade from, factored out so the
 * backtest replay (`lib/backtest/replay.ts`) runs the identical code rather
 * than a re-implementation of it.
 *
 * Why this module exists (2026-09-25, alignment audit findings F3.1–F3.3,
 * project-owner sign-off): after the 2026-09-17 move from STRAT to Gann's
 * swing-crossing trigger, `lib/scanTicker.ts` computed the trigger from
 * **daily** bars in the macro-derived direction, while the replay computed it
 * from **15-minute** bars, only on STRAT-detected candidates, in the
 * pattern's direction, and additionally filtered it through the STRAT gap
 * rule and risk floor. Every replay run since then measured a trigger
 * production never used — the same failure shape as the `harmonicProximity`
 * stale anchor (AGENTS.md, "Cross-platform consistency"). Sharing the code is
 * the structural fix: the two surfaces cannot drift if there is only one.
 *
 * Three-question mandate:
 *
 * 1. **Gann.** Nothing new is sourced here. The trigger is
 *    `lib/gann/entryTrigger.ts` (A8's Buying/Selling Points), and the
 *    direction is `weightedTrendAgreement`'s chart-timeframe power ratio
 *    (`Wall Street Stock Selector`, 1930). This module only decides that both
 *    surfaces read them the same way.
 * 2. **Cycles.** No periodicity claim, so Dewey's checklist does not apply.
 * 3. **Hermetic.** Correspondence ("as above, so below"): what the replay
 *    measures has to correspond to what the scan does, or the measurement
 *    describes nothing. Cause and Effect applies to the replay specifically.
 *    An outcome can only be attributed to a cause the platform actually acts
 *    on.
 */

import type { Bar, StratPattern, TrendReading } from "@/lib/types";
import type { SetupKind } from "@/lib/types";
import { weightedTrendAgreement } from "@/lib/gann/timeframeWeight";
import { nearerBuyingPoint, OLDER_LEVELS_YEARS, olderGannLevels, type GannEntryTrigger, type OlderGannLevel } from "@/lib/gann/entryTrigger";
import {
  CONTINUATION_PATTERNS,
  detectPatterns,
  gapRuleViolated,
  riskFloorViolated,
} from "@/lib/strat/patterns";

export type EntryDirection = "bullish" | "bearish";

/**
 * The fewest daily bars the scan will read a symbol on. Below this,
 * `scanTicker` refuses the symbol, and the replay does not arm a session.
 * One constant, so the two can't disagree about which history counts.
 */
export const MIN_DAILY_BARS_FOR_SCAN = 30;

/**
 * How far back a buying point is read: 52 weeks of daily sessions. The live
 * scan fetches a year of daily bars and the replay holds six, and since PLAN.md
 * item 5 a crossed level stays held until it is bought, so a deeper history
 * could hold a level the scan never sees. One window keeps them the same. Gann
 * names no lookback for reading the chart; this is the live fetch's reach, an
 * engineering choice. Levels older than this come from the monthly chart.
 */
export const ENTRY_CHART_DAYS = 364;

/**
 * The daily bars every surface reads a buying point from: the sessions in the
 * 52 weeks before `asOf` (YYYY-MM-DD), and never `asOf` itself. Gann's
 * crossing is a close, and a session still forming has none, so the live scan
 * reads only completed sessions, as the replay always has.
 */
export function entryChartBars(daily: Bar[], asOf: string): Bar[] {
  const from = entryChartFrom(asOf);
  return daily.filter((b) => {
    const d = b.t.slice(0, 10);
    return d >= from && d < asOf;
  });
}

/** The first day (YYYY-MM-DD) of the 52 weeks before `asOf`. */
export function entryChartFrom(asOf: string): string {
  return new Date(Date.parse(`${asOf}T00:00:00Z`) - ENTRY_CHART_DAYS * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Where a surface's monthly fetch starts so its older levels on `asOf` see
 * the whole span `olderGannLevels` reads: 1 January, `OLDER_LEVELS_YEARS`
 * before `asOf`'s year (step 3 review R10). A surface that reads several days
 * passes the earliest.
 */
export function monthlyChartFrom(asOf: Date): Date {
  return new Date(Date.UTC(asOf.getUTCFullYear() - OLDER_LEVELS_YEARS, 0, 1));
}

/**
 * What a buying point is read from on `asOf`: the 52 weeks of completed daily
 * sessions, and the older levels the monthly chart holds, each previous year's
 * top and bottom and the record before the 52 weeks (PLAN.md item 5, step 3).
 * Every surface that prices, confirms or recovers a buying point reads it
 * through here.
 */
export function entryChart(daily: Bar[], monthly: Bar[], asOf: string): { bars: Bar[]; older: OlderGannLevel[] } {
  return { bars: entryChartBars(daily, asOf), older: olderGannLevels(monthly, asOf, entryChartFrom(asOf)) };
}

/**
 * Gann's trend over the monthly, weekly and daily charts, each weighted by his
 * power ratio (A-TREND-01; *Wall Street Stock Selector*, 1930: a month counts
 * 30 days, a week 7), or null when none of the three reads a trend. The hourly
 * never counts.
 */
export function gannMacroDirection(trends: Pick<TrendReading, "timeframe" | "direction">[]): EntryDirection | null {
  const macro = trends.filter((t) => t.timeframe !== "1Hour") as TrendReading[];
  const score = weightedTrendAgreement(macro, "bullish").weightedScore;
  return score > 0 ? "bullish" : score < 0 ? "bearish" : null;
}

/**
 * Whether a with-trend setup runs with Gann's trend (PLAN.md item 6 step 11,
 * A-TREND-09: "a stock is never too high to buy so long as the trend is up,
 * provided you place a stop", W006 p.22; the mirror for a short, pp.38-39).
 * The trend alone admits it. The momentum, breadth and quota gates it replaced
 * (a 4-hour spike, range expansion, two of three timeframes, two slots a side)
 * had no source in Gann.
 */
export function isWithGannTrend(trends: Pick<TrendReading, "timeframe" | "direction">[], direction: EntryDirection): boolean {
  return gannMacroDirection(trends) === direction;
}

type EntryOf = (direction: EntryDirection) => GannEntryTrigger | null;

/**
 * The buying point a scan with no direction asked of it arms: against Gann's
 * trend, where his counter-trend points stand (double and triple tops and
 * bottoms, held levels, crossings). With no trend on any chart, both sides arm
 * and the nearer buying point is the one (fork F4 a; Polarity: neither side is
 * presumed). `price` is the last close of the chart the buying points were
 * read from, the same price `selectGannEntry` measures nearness from.
 */
export function reversionEntry(
  trends: Pick<TrendReading, "timeframe" | "direction">[],
  entryOf: EntryOf,
  price: number,
): GannEntryTrigger | null {
  const trend = gannMacroDirection(trends);
  if (trend !== null) return entryOf(trend === "bullish" ? "bearish" : "bullish");
  const up = entryOf("bullish");
  const down = entryOf("bearish");
  return up && down ? nearerBuyingPoint(up, down, price) : (up ?? down);
}

/**
 * What one session arms, on the live scan's two passes and in the replay
 * alike: the reversion (`reversionEntry`) and, when the charts read a trend,
 * the buying point with it (`isWithGannTrend`). Each is the nearer of that
 * side's crossing, old level and hold (`selectGannEntry`, via `entryOf`).
 */
export function armSessionEntries(
  trends: Pick<TrendReading, "timeframe" | "direction">[],
  entryOf: EntryOf,
  price: number,
): { setupKind: SetupKind; trigger: GannEntryTrigger }[] {
  const out: { setupKind: SetupKind; trigger: GannEntryTrigger }[] = [];
  const reversion = reversionEntry(trends, entryOf, price);
  if (reversion) out.push({ setupKind: "reversion", trigger: reversion });
  const trend = gannMacroDirection(trends);
  const withTrend = trend !== null ? entryOf(trend) : null;
  if (withTrend) out.push({ setupKind: "continuation", trigger: withTrend });
  return out;
}

/**
 * The direction the scan arms a reversion setup in when it has no buying
 * point to read it from: against Gann's weighted trend, and short when no
 * chart reads one. A caller hunting a continuation supplies its own
 * direction instead. Where buying points exist, `reversionEntry` decides.
 */
export function preferredEntryDirection(
  macroTrends: TrendReading[],
  preference?: { direction: EntryDirection },
): EntryDirection {
  if (preference) return preference.direction;
  const macroDir = weightedTrendAgreement(macroTrends, "bearish").agrees ? "bearish" : "bullish";
  return macroDir === "bearish" ? "bullish" : "bearish";
}

// Three-bar compound setups carry more context than a bare 2-2 (which arms on
// almost every directional bar), so rank them ahead of it.
function specificity(name: StratPattern["name"]): number {
  switch (name) {
    case "2-1-2":
    case "3-1-2":
    case "1-2-2":
    case "3-2-2":
      return 0;
    case "PMG":
      return 1;
    case "2-2":
      return 2;
  }
}

/**
 * The bar-sequence patterns armed on the closed execution bars, ranked the
 * way the scan shows them. Display and confluence only. Since 2026-09-17
 * these patterns do not arm or price the trade (AGENTS.md, "Entry pricing
 * moved off STRAT"), but the top one still feeds `computeScore`'s
 * bare-reversal confirmation. The replay therefore has to pick it the same
 * way the scan does.
 */
export function rankArmedPatterns(input: {
  closedExecutionBars: Parameters<typeof detectPatterns>[0];
  currentPrice: number;
  executionAtr: number;
  preferredDirection: EntryDirection;
  setupKind: SetupKind;
}): StratPattern[] {
  const { closedExecutionBars, currentPrice, executionAtr, preferredDirection, setupKind } = input;
  const armed = detectPatterns(closedExecutionBars).filter(
    (p) => !gapRuleViolated(p, currentPrice) && !riskFloorViolated(p, executionAtr),
  );

  // A continuation is carried by the compound patterns that break in the
  // direction of the bar sequence; the 2-2 family reverses it. Within the
  // preferred direction, rank the continuation shapes first when that is what
  // was asked for.
  const kindRank = (p: StratPattern): number =>
    setupKind === "continuation" && !CONTINUATION_PATTERNS.has(p.name) ? 1 : 0;

  return [...armed].sort((a, b) => {
    const aRev = a.direction === preferredDirection ? 0 : 1;
    const bRev = b.direction === preferredDirection ? 0 : 1;
    if (aRev !== bRev) return aRev - bRev;
    const kind = kindRank(a) - kindRank(b);
    if (kind !== 0) return kind;
    const spec = specificity(a.name) - specificity(b.name);
    if (spec !== 0) return spec;
    return Math.abs(a.triggerPrice - currentPrice) - Math.abs(b.triggerPrice - currentPrice);
  });
}
