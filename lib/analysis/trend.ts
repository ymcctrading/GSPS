import type { Bar, Timeframe, TrendReading } from "@/lib/types";
import { findPivots, clusterLevels, sma } from "./pivots";

/**
 * Trend read per the Premise doc: verify highs/lows, support/resistance,
 * and whether the asset is currently bullish or bearish on this timeframe.
 */
export function readTrend(bars: Bar[], timeframe: Timeframe): TrendReading {
  const closes = bars.map((b) => b.c);
  const last = closes[closes.length - 1] ?? 0;

  const fast = sma(closes, Math.min(20, closes.length));
  const slow = sma(closes, Math.min(50, closes.length));

  // Higher-highs/higher-lows check on recent pivots
  const pivots = findPivots(bars, 3);
  const highs = pivots.filter((p) => p.kind === "high").slice(-3);
  const lows = pivots.filter((p) => p.kind === "low").slice(-3);
  const risingHighs = highs.length >= 2 && highs[highs.length - 1].price > highs[0].price;
  const risingLows = lows.length >= 2 && lows[lows.length - 1].price > lows[0].price;
  const fallingHighs = highs.length >= 2 && highs[highs.length - 1].price < highs[0].price;
  const fallingLows = lows.length >= 2 && lows[lows.length - 1].price < lows[0].price;

  let direction: TrendReading["direction"] = "sideways";
  if (last > fast && fast >= slow && (risingHighs || risingLows)) direction = "bullish";
  else if (last < fast && fast <= slow && (fallingHighs || fallingLows)) direction = "bearish";
  else if (last > slow && risingLows) direction = "bullish";
  else if (last < slow && fallingHighs) direction = "bearish";

  const support = clusterLevels(
    pivots.filter((p) => p.kind === "low" && p.price < last).map((p) => p.price),
  ).slice(0, 5);
  const resistance = clusterLevels(
    pivots.filter((p) => p.kind === "high" && p.price > last).map((p) => p.price),
  ).slice(0, 5);

  return { timeframe, direction, support, resistance };
}
