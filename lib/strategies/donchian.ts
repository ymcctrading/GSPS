/**
 * Donchian channel breakout — a swing trend-following strategy mode, one of
 * `docs/STRATEGY_MODES.md`'s originally-deferred candidates, picked up per
 * direct request.
 *
 * Real, widely-traded technique: a close beyond the highest high/lowest low
 * of the prior N bars is the classic "turtle trading" breakout entry —
 * distinct from `maCrossover.ts`/`macdMomentum.ts` in that it reacts to
 * price itself breaking a channel rather than two derived series crossing.
 *
 * Three-question design basis:
 * 1. Gann grounding: none, deliberate — Strategy Modes carve-out. (Gann
 *    himself traded old-top/old-bottom crossings — see
 *    `lib/gann/entryTrigger.ts` — which a Donchian breakout superficially
 *    resembles; the difference is real and load-bearing, not cosmetic:
 *    Gann's levels come from a *swing chart's* completed reversals
 *    (`lib/gann/swingChart.ts`), a rhythm filter, while a Donchian channel is
 *    a fixed N-bar rolling extreme with no reversal-completion requirement
 *    at all. This mode is the plain rolling-window version, offered as its
 *    own named, real technique rather than dressed up as Gann's.)
 * 2. Cycle theory: the channel period is a lookback window, not a claimed
 *    recurrence interval; Dewey's checklist doesn't apply.
 * 3. Hermetic principle: Rhythm — the channel is the market's own recent
 *    range; a breakout is read as the rhythm's amplitude expanding beyond
 *    its established bounds.
 *
 * Entry: close beyond the (prior-bar) channel extreme, breakout of that
 * bar's own high/low by a small buffer.
 * Stop: the opposite channel bound — the classic Donchian stop reference.
 */

import type { Bar } from "@/lib/types";
import type { StrategyLevels } from "./types";
import { buildLevels } from "./targets";
import { donchian } from "./math";

export const DONCHIAN_PERIOD = 20;
export const BREAKOUT_BUFFER_PCT = 0.05;

export function evaluateDonchian(bars: Bar[]): StrategyLevels | null {
  const n = bars.length;
  if (n < DONCHIAN_PERIOD + 1) return null;
  const series = donchian(bars, DONCHIAN_PERIOD);
  const i = n - 1;
  const channel = series[i];
  if (!channel) return null;

  const bar = bars[i];

  if (bar.c > channel.upper) {
    const entry = bar.h * (1 + BREAKOUT_BUFFER_PCT / 100);
    return buildLevels(
      "donchian",
      "bullish",
      entry,
      channel.lower,
      `Close broke above the ${DONCHIAN_PERIOD}-bar Donchian channel high; entry on a break of this bar's high, stop at the channel's lower bound.`,
      2,
      4,
    );
  }

  if (bar.c < channel.lower) {
    const entry = bar.l * (1 - BREAKOUT_BUFFER_PCT / 100);
    return buildLevels(
      "donchian",
      "bearish",
      entry,
      channel.upper,
      `Close broke below the ${DONCHIAN_PERIOD}-bar Donchian channel low; entry on a break of this bar's low, stop at the channel's upper bound.`,
      2,
      4,
    );
  }

  return null;
}
