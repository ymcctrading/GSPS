/**
 * Which of Gann's buying points priced a plan, as every surface that places,
 * confirms, stores or exits it reads the kind (PLAN.md item 5):
 * - `crossing`: a close 3 points past the old top arms it; the buy is on the
 *   reaction to 1 point past the level (W006 pp.20, 46-47).
 * - `oldLevel`: the buy is at the old bottom itself, the double or triple
 *   bottom (pp.11, 20, 46).
 * Each is bought at the market once a closed bar has traded into its zone
 * (never-failing rule 9, `gannBuyZone`), not with a resting limit.
 * - `hold`: a bottom that has held, bought at the last close (pp.20, 24,
 *   46-47; step 4).
 * Shorts mirror each where Gann states the mirror. Kept free of imports so
 * the lifecycle, order and copy modules can read it without the chart code.
 */
export type GannEntryKind = "crossing" | "oldLevel" | "hold";

/**
 * Which of Gann's rules found a buy (sell) at the last close (`hold` only):
 * a bottom that held for weeks, for days after a bull-market reaction, or a
 * record low that held; `rally`, the sell at the end of a bear-market
 * rally's second or third week (W006 p.47, Rule 4); or `narrowWeek`, the sell
 * after a narrow week and a sharp drop on large volume (W006 p.27, A-ENTRY-19).
 */
export type GannHoldBasis = "weeks" | "days" | "record" | "rally" | "narrowWeek";

/**
 * True for a buying point whose order rests from the start with nothing to
 * cross first: ready on any bar that has not closed through the stop, off
 * once one has, with no crossed level for the exit's hold test.
 */
export function restsWithoutCrossing(kind: GannEntryKind | string | null | undefined): boolean {
  return kind === "oldLevel" || kind === "hold";
}
