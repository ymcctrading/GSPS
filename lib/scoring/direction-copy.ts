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

/**
 * The Protocol signal's own rationale, in the structural trigger's own terms,
 * not the bar-sequence pattern's. Since 2026-09-17 the trade plan is armed and
 * priced by crossing the prior completed swing's top or bottom plus a 3-point
 * allowance, price-scaled (`lib/gann/entryTrigger.ts`), and since PLAN.md
 * item 5 step 2 also by a resting order at an old bottom (top) that held, the
 * double or triple bottom. `direction` is the direction the trade plan itself
 * was computed against, and `entryKind` which of the two priced it. Kept free
 * of internal-methodology vocabulary per `scripts/check-banned-terms.mjs`.
 */
export function structuralTriggerHeadline(
  direction: "bullish" | "bearish",
  entryKind?: "crossing" | "oldLevel",
): string {
  if (entryKind === "oldLevel") {
    return direction === "bullish"
      ? "A buy resting at the last confirmed swing low, where a second or third test makes a double or triple bottom, with the stop 3 points under it."
      : "A sell resting at the last confirmed swing high, where a second or third test makes a double or triple top, with the stop 3 points over it.";
  }
  return direction === "bullish"
    ? "A close 3 points over the prior confirmed swing high, then a buy on the pullback toward it."
    : "A close 3 points under the prior confirmed swing low, then a sell on the bounce toward it.";
}
