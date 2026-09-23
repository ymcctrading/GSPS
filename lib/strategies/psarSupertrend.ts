/**
 * PSAR + Supertrend reversal strategy mode.
 *
 * Real, commonly-traded combination: both Wilder's Parabolic SAR and
 * Supertrend are trend-following stop-and-reverse overlays: each one is a
 * single line that flips sides of price when the trend turns. Pairing them
 * is a standard intraday-reversal technique — trading only the bar where
 * both flip in agreement filters out the many single-indicator flips that
 * don't hold, at the cost of a later, more expensive entry, which is exactly
 * the tradeoff a trader accepts for a "confirmed" reversal signal rather
 * than a "first" one. Confirmed here per AGENTS.md's instruction to check
 * this thesis before assuming it, not asserted as this codebase's own claim.
 *
 * Three-question design basis (AGENTS.md's three-question mandate, which
 * applies platform-wide, not only to Gann surfaces):
 *
 * 1. Gann grounding: none, and none is claimed. This is the one family of
 *    modes AGENTS.md's "Strategy Modes" section exists to carve out —
 *    opt-in, non-default, never touching the scored verdict.
 * 2. Cycle theory (Dewey): this mode makes no periodicity claim — it reacts
 *    to whichever bar the two indicators happen to flip on, with no assumed
 *    recurrence interval. Dewey's checklist doesn't apply, the same "not
 *    applicable, no periodicity claimed" answer `lib/gann/entryTrigger.ts`
 *    gives for the same reason.
 * 3. Hermetic principle: Polarity — PSAR and Supertrend are each binary,
 *    single-line stop-and-reverse systems; requiring both flips to agree is
 *    literally requiring two independent readings of the same
 *    trend/counter-trend polarity to align before acting.
 *
 * Entry: the close of the bar where PSAR and Supertrend both read the new
 * direction, breakout of that bar's high (bullish) / low (bearish) by a
 * small buffer — an engineering choice (not a Gann "lost motion" citation;
 * this mode is deliberately outside that citation discipline), sized the
 * same way the rest of this codebase's breakout buffers are, as a
 * percentage of price so it scales across instruments.
 * Stop: the just-flipped indicator level closer to entry (i.e. the tighter
 * of the two), since either line is this strategy's own natural protective
 * stop — using the tighter one keeps the mode's risk honest rather than
 * quietly widening it to whichever line is more forgiving.
 */

import type { Bar } from "@/lib/types";
import type { StrategyLevels } from "./types";
import { buildLevels } from "./targets";
import { psar, supertrend } from "./math";

/** Breakout buffer as a percentage of the trigger bar's extreme, so the
 * absolute cents scale with price. Plain engineering choice, not a citation. */
export const BREAKOUT_BUFFER_PCT = 0.05;

export function evaluatePsarSupertrend(bars: Bar[]): StrategyLevels | null {
  const psarSeries = psar(bars);
  const stSeries = supertrend(bars);
  const n = bars.length;
  if (n < 3) return null;

  const i = n - 1;
  const prevI = n - 2;
  const p = psarSeries[i];
  const st = stSeries[i];
  const pPrev = psarSeries[prevI];
  const stPrev = stSeries[prevI];
  if (!p || !st || !pPrev || !stPrev) return null;

  // Both indicators must have flipped in the SAME direction on this bar —
  // agreeing already before this bar (no fresh flip) is not this setup.
  const psarFlippedUp = pPrev.trend === "down" && p.trend === "up";
  const psarFlippedDown = pPrev.trend === "up" && p.trend === "down";
  const stFlippedUp = stPrev.trend === "down" && st.trend === "up";
  const stFlippedDown = stPrev.trend === "up" && st.trend === "down";

  const bar = bars[i];

  if (psarFlippedUp && stFlippedUp) {
    const entry = bar.h * (1 + BREAKOUT_BUFFER_PCT / 100);
    const stopLoss = Math.max(p.value, st.value); // tighter of the two, below entry
    return buildLevels(
      "psarSupertrend",
      "bullish",
      entry,
      stopLoss,
      "PSAR and Supertrend both flipped bullish on this bar; entry on a break of its high, stop at the tighter of the two flipped levels.",
    );
  }

  if (psarFlippedDown && stFlippedDown) {
    const entry = bar.l * (1 - BREAKOUT_BUFFER_PCT / 100);
    const stopLoss = Math.min(p.value, st.value); // tighter of the two, above entry
    return buildLevels(
      "psarSupertrend",
      "bearish",
      entry,
      stopLoss,
      "PSAR and Supertrend both flipped bearish on this bar; entry on a break of its low, stop at the tighter of the two flipped levels.",
    );
  }

  return null;
}
