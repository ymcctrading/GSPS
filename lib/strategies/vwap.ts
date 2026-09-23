/**
 * VWAP reclaim/loss — an intraday mean-reversion strategy mode, built on the
 * "VWAP variants" candidate this document's own deferred list named
 * (`docs/STRATEGY_MODES.md`), and needed directly: Pro-tier access to
 * Strategy Modes (AGENTS.md's "Strategy Modes" section) is scoped to
 * MACD/RSI/EMA+SMA/VWAP, so this mode has to exist before that gate can be
 * real rather than aspirational.
 *
 * Real, widely-traded technique: session VWAP is the average price weighted
 * by volume since the session anchor, read by many intraday traders as the
 * "fair value" line institutions transact around. Price reclaiming VWAP from
 * below (or losing it from above) is a standard intraday reversal read —
 * distinct from a band-touch mean reversion (`bollinger.ts`) since VWAP has
 * no fixed band, only the cross itself.
 *
 * Three-question design basis:
 * 1. Gann grounding: none, deliberate — Strategy Modes carve-out.
 * 2. Cycle theory: VWAP is a session-anchored cumulative average, not a
 *    periodicity claim; Dewey's checklist doesn't apply. (The anchor point
 *    itself — the trading session — recurs daily, but this mode makes no
 *    claim *about* that recurrence, only computes an average within it, the
 *    same distinction `lib/scan/universe-rotation.ts` draws between a
 *    time-anchored mechanism and a market-behavior claim.)
 * 3. Hermetic principle: Cause and Effect — VWAP reclaim/loss is read as the
 *    effect of a shift in who is transacting at what price relative to the
 *    session's own volume-weighted center, the same causal framing
 *    `macdMomentum.ts` gives its own histogram flip.
 *
 * Entry: breakout of the bar where price closes back on the other side of
 * VWAP from where the prior bar closed.
 * Stop: that bar's own extreme (the reclaim/loss bar itself is this mode's
 * natural stop reference, same convention `rsiReversal.ts` and
 * `bollinger.ts` use for their own single-bar triggers).
 */

import type { Bar } from "@/lib/types";
import type { StrategyLevels } from "./types";
import { buildLevels } from "./targets";
import { vwap } from "./math";

export function evaluateVwap(bars: Bar[]): StrategyLevels | null {
  const n = bars.length;
  if (n < 2) return null;
  const series = vwap(bars);
  const i = n - 1;
  const prevI = n - 2;
  const value = series[i];
  const prevValue = series[prevI];
  if (value == null || prevValue == null) return null;

  const bar = bars[i];
  const prevBar = bars[prevI];

  const reclaimed = prevBar.c < prevValue && bar.c >= value;
  const lost = prevBar.c > prevValue && bar.c <= value;

  if (reclaimed) {
    return buildLevels(
      "vwap",
      "bullish",
      bar.h,
      bar.l,
      "Price closed back above session VWAP after closing below it; entry on a break of this bar's high, stop below its low.",
    );
  }

  if (lost) {
    return buildLevels(
      "vwap",
      "bearish",
      bar.l,
      bar.h,
      "Price closed back below session VWAP after closing above it; entry on a break of this bar's low, stop above its high.",
    );
  }

  return null;
}
