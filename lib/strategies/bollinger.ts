/**
 * Bollinger Band reversion — a swing mean-reversion strategy mode.
 *
 * Real, widely-traded technique: a bar that pierces a Bollinger band and
 * closes back inside it is a standard "band rejection" reversal signal —
 * price temporarily overextended past its own recent volatility envelope and
 * snapped back, distinct from a squeeze/breakout continuation read (not
 * built here; reversion only, matching the platform's existing "reversal
 * pattern" language for the other opt-in modes).
 *
 * Three-question design basis:
 * 1. Gann grounding: none, deliberate — Strategy Modes carve-out.
 * 2. Cycle theory: the bands are a rolling standard deviation, not a fixed
 *    period claim about recurrence; Dewey's checklist doesn't apply.
 * 3. Hermetic principle: Rhythm and Polarity together — price oscillates
 *    (Rhythm) between two poles (Polarity) defined by its own recent
 *    volatility; a piercing-and-reversion bar is a reading of price
 *    overshooting one pole and swinging back toward the other.
 *
 * Entry: breakout of the rejection bar's high/low (confirms the reversal is
 * already under way rather than acting on the piercing bar itself).
 * Stop: beyond the rejection bar's own extreme (the band pierce). Targets:
 * the middle band (TP1) and the opposite band (master target) rather than a
 * flat R-multiple, since the bands themselves are this mode's own natural
 * targets — `buildLevels` is bypassed here for that reason.
 */

import type { Bar } from "@/lib/types";
import type { StrategyLevels } from "./types";
import { bollinger } from "./math";

export function evaluateBollinger(bars: Bar[]): StrategyLevels | null {
  const n = bars.length;
  if (n < 21) return null;
  const bands = bollinger(bars, 20, 2);
  const i = n - 1;
  const band = bands[i];
  if (!band) return null;
  const bar = bars[i];

  // Bullish rejection: this bar's low pierced the lower band, but it closed
  // back inside it.
  if (bar.l < band.lower && bar.c >= band.lower) {
    const entry = bar.h;
    const stopLoss = bar.l;
    const riskPerShare = entry - stopLoss;
    if (riskPerShare <= 0) return null;
    return {
      mode: "bollinger",
      direction: "bullish",
      entry,
      stopLoss,
      takeProfit1: band.middle,
      masterTarget: band.upper,
      riskPerShare,
      rationale:
        "Low pierced the lower Bollinger Band and closed back inside it; entry on a break of the rejection bar's high, stop below its low, targets at the middle then upper band.",
    };
  }

  // Bearish rejection: this bar's high pierced the upper band, but it closed
  // back inside it.
  if (bar.h > band.upper && bar.c <= band.upper) {
    const entry = bar.l;
    const stopLoss = bar.h;
    const riskPerShare = stopLoss - entry;
    if (riskPerShare <= 0) return null;
    return {
      mode: "bollinger",
      direction: "bearish",
      entry,
      stopLoss,
      takeProfit1: band.middle,
      masterTarget: band.lower,
      riskPerShare,
      rationale:
        "High pierced the upper Bollinger Band and closed back inside it; entry on a break of the rejection bar's low, stop above its high, targets at the middle then lower band.",
    };
  }

  return null;
}
