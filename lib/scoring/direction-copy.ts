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
 * was computed against, `entryKind` which of them priced it,
 * `entrySource` which old level a crossing crossed (PLAN.md item 5, step 3),
 * and `holdBasis` which rule found a bottom that held (step 4). Kept free
 * of internal-methodology vocabulary per `scripts/check-banned-terms.mjs`.
 */
/**
 * A previous year's top (bottom for a short), by its year when known: every
 * previous year counts (PLAN.md item 5, step 3 review R9). Without the year,
 * as on plans built before it was carried, "the previous year's".
 */
export function priorYearLevelName(up: boolean, year?: number): string {
  const side = up ? "top" : "bottom";
  return year !== undefined ? `the ${year} ${side}` : `the previous year's ${side}`;
}

/**
 * The old level a regained crossing went back through (A-TREND-10, W006
 * p.30): for a buy, the old bottom price had closed 3 points under; for a
 * sell, the old top it had closed 3 points over.
 */
export function regainedLevelName(up: boolean, source?: "priorYear" | "allTime", year?: number): string {
  if (source === "priorYear") return priorYearLevelName(!up, year);
  if (source === "allTime") return up ? "the old record low" : "the old record high";
  return up ? "the old swing low" : "the old swing high";
}

export function structuralTriggerHeadline(
  direction: "bullish" | "bearish",
  entryKind?: "crossing" | "oldLevel" | "hold",
  entrySource?: "priorYear" | "allTime",
  holdBasis?: "weeks" | "days" | "record" | "rally" | "narrowWeek",
  /** A previous year's level: its year (step 3 review R9). */
  levelYear?: number,
  /** A level regained after a break (A-TREND-10). */
  regained?: boolean,
): string {
  if (entryKind === "hold" && holdBasis === "narrowWeek") {
    // The sell after a narrow week and a sharp drop on large volume (A-ENTRY-19).
    return "A sell on the bounce after a sharp drop on heavy volume, with the stop just over the level it broke.";
  }
  if (entryKind === "hold" && holdBasis === "rally") {
    // The sell at the end of a bear-market rally (item 5, step 4b).
    return "A sell at the last close, once a rally in a falling market has run its course, with the stop just over the rally's high.";
  }
  if (entryKind === "hold") {
    // A bottom (top) that held, bought at the last close (item 5, step 4).
    const up = direction === "bullish";
    // Plain words, never the rule's timing (confidential sources, owner 2026-10-28).
    const held = holdBasis === "record" ? `the record ${up ? "low" : "high"} having held` : `the ${up ? "low" : "high"} having held`;
    return up
      ? `A buy at the last close, ${held}, with the stop just under the low.`
      : `A sell at the last close, ${held}, with the stop just over the high.`;
  }
  if (entryKind === "oldLevel") {
    return direction === "bullish"
      ? "A buy resting at the last confirmed swing low, where a second or third test makes a double or triple bottom, with the stop just under it."
      : "A sell resting at the last confirmed swing high, where a second or third test makes a double or triple top, with the stop just over it.";
  }
  // Since step 3 the level crossed can also be a previous year's top or
  // bottom, or the record from before the last 52 weeks.
  const up = direction === "bullish";
  if (regained) {
    const old = regainedLevelName(up, entrySource, levelYear);
    return up
      ? `A close clearly back over ${old} after a break under it, then a buy on the pullback toward it.`
      : `A close clearly back under ${old} after a break over it, then a sell on the bounce toward it.`;
  }
  const level =
    entrySource === "priorYear"
      ? priorYearLevelName(up, levelYear)
      : entrySource === "allTime"
        ? up ? "the old record high" : "the old record low"
        : up ? "the prior confirmed swing high" : "the prior confirmed swing low";
  return up
    ? `A close clearly over ${level}, then a buy on the pullback toward it.`
    : `A close clearly under ${level}, then a sell on the bounce toward it.`;
}
