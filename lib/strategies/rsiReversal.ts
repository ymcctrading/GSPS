/**
 * RSI 14 reversal — an overbought/oversold reversal strategy mode, usable
 * intraday or swing depending on the timeframe the caller supplies bars on.
 *
 * Real, widely-traded technique: RSI crossing back out of the classic 30/70
 * bands is a standard momentum-exhaustion reversal signal.
 *
 * Three-question design basis:
 * 1. Gann grounding: none, deliberate — Strategy Modes carve-out.
 * 2. Cycle theory: RSI's 14-period lookback is a smoothing window, not a
 *    recurrence claim; Dewey's checklist doesn't apply.
 * 3. Hermetic principle: Polarity — 30 and 70 are the two poles RSI
 *    oscillates between, and this mode fires specifically on the cross back
 *    from one pole toward center, i.e. the polarity reasserting itself.
 *
 * Entry: breakout of the crossing bar's high/low.
 * Stop: beyond the crossing bar's own extreme (the same bar that produced
 * the oversold/overbought reading).
 */

import type { Bar } from "@/lib/types";
import type { StrategyLevels } from "./types";
import { buildLevels } from "./targets";
import { rsi } from "./math";

export const OVERSOLD = 30;
export const OVERBOUGHT = 70;

export function evaluateRsiReversal(bars: Bar[]): StrategyLevels | null {
  const n = bars.length;
  if (n < 16) return null;
  const series = rsi(bars, 14);
  const i = n - 1;
  const prevI = n - 2;
  const value = series[i];
  const prevValue = series[prevI];
  if (value == null || prevValue == null) return null;

  const bar = bars[i];

  if (prevValue < OVERSOLD && value >= OVERSOLD) {
    const entry = bar.h;
    const stopLoss = bar.l;
    return buildLevels(
      "rsiReversal",
      "bullish",
      entry,
      stopLoss,
      `RSI(14) crossed back above ${OVERSOLD} from oversold; entry on a break of this bar's high, stop below its low.`,
    );
  }

  if (prevValue > OVERBOUGHT && value <= OVERBOUGHT) {
    const entry = bar.l;
    const stopLoss = bar.h;
    return buildLevels(
      "rsiReversal",
      "bearish",
      entry,
      stopLoss,
      `RSI(14) crossed back below ${OVERBOUGHT} from overbought; entry on a break of this bar's low, stop above its high.`,
    );
  }

  return null;
}
