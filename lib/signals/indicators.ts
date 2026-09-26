/**
 * Server-side indicator primitives for the Signal and Regime Engine.
 * Operates on `Bar[]` (o/h/l/c/v, ascending, closed bars only) — the same
 * shape the rest of `lib/strat` and `lib/scoring` use — rather than the
 * chart-facing `Candle[]` shape in `lib/indicators.ts`.
 */

import type { Bar } from "@/lib/types";
// `smaSeries`, `slope` and `anchoredVwap` lived here until 2026-09-26. They
// fed the moving-average and VWAP checks the regime engine and trend-pullback
// state no longer make (alignment audit F2.5), and were deleted once they had
// no consumer. The strategy modes and chart overlays keep their own copies
// (lib/strategies/math.ts, lib/indicators.ts) and never read this module.

/** Latest bar's volume relative to its own trailing average — "volume behavior". */
export function relativeVolume(bars: Bar[], lookback = 20): number | null {
  if (bars.length < lookback + 1) return null;
  const history = bars.slice(-lookback - 1, -1);
  const avg = history.reduce((s, b) => s + b.v, 0) / history.length;
  if (avg === 0) return null;
  return bars[bars.length - 1].v / avg;
}

/** True range of the latest bar, in multiples of the trailing ATR — flags abnormal expansion. */
export function lastRangeInAtrMultiples(bars: Bar[], atrValue: number): number {
  if (bars.length === 0 || atrValue === 0) return 0;
  const last = bars[bars.length - 1];
  return (last.h - last.l) / atrValue;
}
