import type { Bar, Timeframe, TrendReading } from "@/lib/types";
import { findPivots, clusterLevels } from "./pivots";
import { readGannTrend } from "@/lib/gann/trendStrength";
import { beyondByThreePoints } from "@/lib/gann/pointScale";

/**
 * Trend read per the Premise doc: verify highs/lows, support/resistance,
 * and whether the asset is currently bullish or bearish on this timeframe.
 *
 * **Direction is Gann's swing trend (2026-09-26, alignment audit F2.5).** It
 * used to come from SMA 20/50 (price above a rising fast average, and so on)
 * with a pivot check. That put a non-Gann indicator under every setup's
 * direction and the score's macro criteria. It is now `readGannTrend`: the
 * weekly (7-day) swing chart's trend, confirmed only when the 3-day swings are
 * stepping the same way. Anything unconfirmed is "sideways". The same read
 * applies on monthly, weekly and daily bars. Gann kept swing charts on every
 * timeframe, and Correspondence is why a rule read on one is expected to hold
 * on another. Pivots still supply the support/resistance lists, old tops
 * crossed by the 3 points counting as support and old bottoms broken by them
 * as resistance (A-LEVELS-01, 2026-10-16).
 *
 * Three-question basis:
 * 1. Gann: swing charts (the 3-Day Chart, A09 Ch. VII, and the 7-day weekly
 *    chart, A8 1951 pp. 316-317); trend is read
 *    from rising or falling tops and bottoms (docs/GANN_HISTORICAL_SOURCES.md,
 *    via lib/gann/trendStrength.ts).
 * 2. Cycles: this makes no periodicity claim. The 3 and 7 are Gann's
 *    reversal counts, not cycle lengths, so Dewey's checklist doesn't apply.
 * 3. Hermetic: Correspondence, since one rule serves every timeframe. Rhythm
 *    also fits: the swing chart only turns when the market's own swing
 *    rhythm turns, not when an average of past closes drifts across another.
 */
/**
 * The highest and lowest close after each bar (exclusive), in one pass, so
 * "a later close beyond the level" is one look-up per pivot (review 11 L1:
 * rescanning from every pivot made `readTrend` 16-18 times slower).
 */
export function closesAfter(bars: Bar[]): { maxAfter: Float64Array; minAfter: Float64Array } {
  const n = bars.length;
  const maxAfter = new Float64Array(n);
  const minAfter = new Float64Array(n);
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = n - 1; i >= 0; i--) {
    maxAfter[i] = hi;
    minAfter[i] = lo;
    hi = Math.max(hi, bars[i].c);
    lo = Math.min(lo, bars[i].c);
  }
  return { maxAfter, minAfter };
}

export function readTrend(bars: Bar[], timeframe: Timeframe): TrendReading {
  const closes = bars.map((b) => b.c);
  const last = closes[closes.length - 1] ?? 0;

  const pivots = findPivots(bars, 3);
  const direction: TrendReading["direction"] = readGannTrend(bars).direction ?? "sideways";

  // "Old tops become bottoms, old bottoms later become tops" (A-LEVELS-01,
  // W006 p.13, pp.40-41; in a bear market, p.24): a top below the price that a
  // later close has cleared by Gann's 3 points is support, and a bottom above
  // it that a later close has broken by them is resistance (fork FL1 a,
  // 2026-10-16; until then only bottoms were support and tops resistance). A
  // top under the price not yet cleared by the 3 points is still being tested,
  // and is neither. Engineering choices, labelled: pivot strength 3, the 1%
  // cluster, the five strongest clusters.
  const { maxAfter, minAfter } = closesAfter(bars);
  const crossed = (p: (typeof pivots)[number]) =>
    p.kind === "high" ? maxAfter[p.index] > beyondByThreePoints(p.price, 1) : minAfter[p.index] < beyondByThreePoints(p.price, -1);
  const support = clusterLevels(
    pivots.filter((p) => p.price < last && (p.kind === "low" || crossed(p))).map((p) => p.price),
  ).slice(0, 5);
  const resistance = clusterLevels(
    pivots.filter((p) => p.price > last && (p.kind === "high" || crossed(p))).map((p) => p.price),
  ).slice(0, 5);

  return { timeframe, direction, support, resistance };
}
