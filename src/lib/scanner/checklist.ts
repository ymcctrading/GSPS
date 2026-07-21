/**
 * The 9-point proprietary mean-reversion checklist + the Strat Sniper Gate.
 *
 * This encodes the waterfall described in Doc 4 §2 (Backend Scanning Engine):
 *   1. Strat Sniper Gate  — structural trend-agreement checkpoint (hard filter)
 *   2. 9-point checklist  — score 0..9; 8/9 or 9/9 = Tier 1 "Pristine"
 *   3. Velocity fallback  — 7/9 admitted only with RVOL >= 2.0 or ATR expansion
 *
 * NOTE: the exact Gann/Strat rule set is proprietary to the owner. The structure
 * here is faithful to the spec and fully wired; individual rule *thresholds* are
 * reasonable placeholders to be tuned against the owner's real strategy + the
 * reference screenshots (still pending — see review log Q-6).
 */
import type { OHLCVBar } from "@/lib/marketData/types";
import type { Bias, ChecklistItem, Indicators } from "./types";
import { sma } from "./indicators";

/** Velocity threshold for the Tier-2 fallback. */
export const RVOL_VELOCITY_THRESHOLD = 2.0;
/** ATR% above this counts as "active ATR expansion". */
export const ATR_EXPANSION_PCT = 3.0;

/**
 * Strat Sniper Gate: require structural trend agreement. A setup passes only if
 * the short-term structure agrees with the reversion direction — i.e. price has
 * stretched away from its mean far enough to be a genuine reversion candidate
 * (|z| >= 1) and the most recent bar shows a directional "snap" back toward it.
 */
export function stratSniperGate(bars: OHLCVBar[], indicators: Indicators): boolean {
  if (bars.length < 3) return false;
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const stretched = Math.abs(indicators.zScore) >= 1;
  // A snap bar: closes back toward the mean relative to the prior bar.
  const snappingUp = indicators.zScore < 0 && last.close > prev.close;
  const snappingDown = indicators.zScore > 0 && last.close < prev.close;
  return stretched && (snappingUp || snappingDown);
}

export function inferBias(indicators: Indicators): Bias {
  if (indicators.zScore <= -1) return "BULLISH"; // stretched below mean -> revert up
  if (indicators.zScore >= 1) return "BEARISH"; // stretched above mean -> revert down
  return "NEUTRAL";
}

/** Evaluate the 9 checklist rules; returns items (score = count of passed). */
export function evaluateChecklist(
  bars: OHLCVBar[],
  indicators: Indicators,
  bias: Bias
): ChecklistItem[] {
  const closes = bars.map((b) => b.close);
  const last = bars[bars.length - 1];
  const sma50 = sma(closes, 50);
  const bullish = bias === "BULLISH";

  const items: ChecklistItem[] = [
    {
      key: "mean_distance",
      passed: Math.abs(indicators.zScore) >= 1.5,
      detail: `z-score ${indicators.zScore} (|z| >= 1.5 for a strong stretch)`,
    },
    {
      key: "rsi_extreme",
      passed: bullish ? indicators.rsi14 <= 35 : indicators.rsi14 >= 65,
      detail: `RSI ${indicators.rsi14} (${bullish ? "<=35 oversold" : ">=65 overbought"})`,
    },
    {
      key: "reversion_candle",
      passed: bullish ? last.close > last.open : last.close < last.open,
      detail: `last candle ${last.close > last.open ? "green" : "red"} vs. bias`,
    },
    {
      key: "volume_participation",
      passed: indicators.rvol >= 1.2,
      detail: `RVOL ${indicators.rvol} (>= 1.2)`,
    },
    {
      key: "atr_healthy",
      passed: indicators.atrPct >= 1.0,
      detail: `ATR ${indicators.atrPct}% (>= 1.0% tradable range)`,
    },
    {
      key: "trend_context",
      passed: bullish ? last.close < sma50 : last.close > sma50,
      detail: `price vs SMA50 aligns with reversion`,
    },
    {
      key: "not_gap_trap",
      passed: Math.abs(last.open - bars[bars.length - 2].close) < indicators.atr14,
      detail: `open gap < 1 ATR (avoids runaway gaps)`,
    },
    {
      key: "band_touch",
      passed: bullish
        ? last.low <= indicators.sma20 - 2 * indicators.atr14
        : last.high >= indicators.sma20 + 2 * indicators.atr14,
      detail: `tagged 2-ATR reversion band`,
    },
    {
      key: "momentum_turn",
      passed:
        bars.length >= 3 &&
        (bullish
          ? last.close > bars[bars.length - 2].close
          : last.close < bars[bars.length - 2].close),
      detail: `momentum turning toward mean`,
    },
  ];
  return items;
}

export function scoreOf(items: ChecklistItem[]): number {
  return items.reduce((s, i) => s + (i.passed ? 1 : 0), 0);
}

/** Is this setup admissible under the Tier-2 velocity fallback? */
export function hasVelocity(indicators: Indicators): boolean {
  return (
    indicators.rvol >= RVOL_VELOCITY_THRESHOLD ||
    indicators.atrPct >= ATR_EXPANSION_PCT
  );
}
