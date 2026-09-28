import type { Bar, Timeframe, TrendReading } from "@/lib/types";
import { findPivots, clusterLevels } from "./pivots";
import { readGannTrend } from "@/lib/gann/trendStrength";

/**
 * Trend read per the Premise doc: verify highs/lows, support/resistance,
 * and whether the asset is currently bullish or bearish on this timeframe.
 *
 * **Direction is Gann's swing trend (2026-09-26, alignment audit F2.5).** It
 * used to come from SMA 20/50 (price above a rising fast average, and so on)
 * with a pivot check. That put a non-Gann indicator under every setup's
 * direction and the score's macro criteria. It is now `readGannTrend`: the
 * 9-day swing chart's direction, confirmed only when the 3-day swings are
 * stepping the same way. Anything unconfirmed is "sideways". The same read
 * applies on monthly, weekly and daily bars. Gann kept swing charts on every
 * timeframe, and Correspondence is why a rule read on one is expected to hold
 * on another. Pivots still supply the support/resistance lists.
 *
 * Three-question basis:
 * 1. Gann: swing charts (the 3-day and 9-day charts, Ch. VII); trend is read
 *    from rising or falling tops and bottoms (docs/GANN_HISTORICAL_SOURCES.md,
 *    via lib/gann/trendStrength.ts).
 * 2. Cycles: this makes no periodicity claim. The 3 and 9 are Gann's
 *    reversal counts, not cycle lengths, so Dewey's checklist doesn't apply.
 * 3. Hermetic: Correspondence, since one rule serves every timeframe. Rhythm
 *    also fits: the swing chart only turns when the market's own swing
 *    rhythm turns, not when an average of past closes drifts across another.
 */
export function readTrend(bars: Bar[], timeframe: Timeframe): TrendReading {
  const closes = bars.map((b) => b.c);
  const last = closes[closes.length - 1] ?? 0;

  const pivots = findPivots(bars, 3);
  const direction: TrendReading["direction"] = readGannTrend(bars).direction ?? "sideways";

  const support = clusterLevels(
    pivots.filter((p) => p.kind === "low" && p.price < last).map((p) => p.price),
  ).slice(0, 5);
  const resistance = clusterLevels(
    pivots.filter((p) => p.kind === "high" && p.price > last).map((p) => p.price),
  ).slice(0, 5);

  return { timeframe, direction, support, resistance };
}
