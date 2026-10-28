/**
 * Elliott Wave, wave 3 entry: a swing Strategy Mode (owner, 2026-10-28,
 * "GSPS should compute Elliott Wave"), read from the shared count in
 * `./elliottCount.ts`.
 *
 * Real, widely taught technique: once waves 1 and 2 of a new move are in
 * place, the trader buys the break of wave 1's end to catch wave 3, the
 * longest and strongest wave in most counts. The stop sits at wave 1's start,
 * the point where Elliott's first rule (wave 2 never retraces past the start
 * of wave 1) says the count is wrong. The targets are the common wave 3
 * extensions from wave 2's end: 1.618 times wave 1 (TP1) and 2.618 times
 * (master). The mirror sells the break of a falling wave 1.
 *
 * Three-question design basis:
 * 1. House-method grounding: none, deliberate; Strategy Modes carve-out.
 * 2. Cycle theory: wave counts are swing patterns, not periods; Dewey's
 *    checklist does not apply and no time is projected.
 * 3. Hermetic principle: Rhythm, the wave principle's alternation of advance
 *    and correction; Polarity in the mirrored short.
 *
 * Engineering choices, labelled: the 0.05% breakout buffer (as Donchian's),
 * wave 2 retracing at least 23.6% of wave 1 (`MIN_WAVE_TWO_RETRACE`), and the
 * zigzag swing filter in the counter.
 */

import type { Bar } from "@/lib/types";
import type { StrategyLevels } from "./types";
import { countElliott } from "./elliottCount";

export const BREAKOUT_BUFFER_PCT = 0.05;
export const WAVE_THREE_TP1 = 1.618;
export const WAVE_THREE_MTP = 2.618;

export function evaluateElliottWave(bars: Bar[]): StrategyLevels | null {
  if (bars.length < 30) return null;
  const setup = countElliott(bars).setup;
  if (!setup) return null;
  const [p0, p1, p2] = setup.points;
  const s = setup.direction === "bullish" ? 1 : -1;
  const wave1 = Math.abs(p1.price - p0.price);
  const entry = p1.price * (1 + (s * BREAKOUT_BUFFER_PCT) / 100);
  const stopLoss = p0.price;
  const riskPerShare = Math.abs(entry - stopLoss);
  const takeProfit1 = p2.price + s * WAVE_THREE_TP1 * wave1;
  const masterTarget = p2.price + s * WAVE_THREE_MTP * wave1;
  if (!(riskPerShare > 0) || s * (takeProfit1 - entry) <= 0) return null;
  const pct = Math.round(setup.retrace * 100);
  return {
    mode: "elliottWave",
    direction: setup.direction,
    entry,
    stopLoss,
    takeProfit1,
    masterTarget,
    riskPerShare,
    rationale:
      `Waves 1 and 2 are in place (wave 2 gave back ${pct}% of wave 1). Entry on a break of wave 1's end ` +
      `to catch wave 3; stop at wave 1's start, where the count is wrong; targets at 1.618 and 2.618 ` +
      `times wave 1 from wave 2's end. One valid count; others are possible.`,
  };
}
