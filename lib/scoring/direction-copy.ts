/**
 * User-facing label for a scan's trade direction.
 *
 * "Bullish"/"bearish" describes market context — a trend reading, a
 * timeframe's bias — and stays as-is wherever that's what's shown (the
 * multi-timeframe trend grid, for instance). Where the UI is telling someone
 * which side to trade — an armed pattern, a scan result row, the order
 * ticket — "buy"/"sell" says what to actually do, so that's what those spots
 * use instead. This is the one place that mapping lives, so the two labels
 * can't drift apart between the dashboard, the ticker page, and the order
 * ticket.
 */

import type { Direction } from "@/lib/types";

export function tradeSideLabel(direction: Direction): "Buy" | "Sell" | "—" {
  if (direction === "bullish") return "Buy";
  if (direction === "bearish") return "Sell";
  return "—";
}

/** Lowercase form for mid-sentence use ("near a buy setup point"). */
export function tradeSideWord(direction: Exclude<Direction, "none">): "buy" | "sell" {
  return direction === "bullish" ? "buy" : "sell";
}
