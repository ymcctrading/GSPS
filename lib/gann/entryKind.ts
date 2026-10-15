/**
 * Which of Gann's buying points priced a plan, as every surface that places,
 * confirms, stores or exits it reads the kind (PLAN.md item 5):
 * - `crossing`: a close 3 points past the old top arms it; the order rests
 *   1 point past the level for the reaction (W006 pp.20, 46-47).
 * - `oldLevel`: the order rests at the old bottom itself, the double or
 *   triple bottom (pp.11, 20, 46).
 * - `hold`: a bottom that has held, bought at the last close (pp.20, 24,
 *   46-47; step 4).
 * Shorts mirror each where Gann states the mirror. Kept free of imports so
 * the lifecycle, order and copy modules can read it without the chart code.
 */
export type GannEntryKind = "crossing" | "oldLevel" | "hold";

/** Which of Gann's hold rules found a held bottom (`hold` only). */
export type GannHoldBasis = "weeks" | "days" | "record";

/**
 * True for a buying point whose order rests from the start with nothing to
 * cross first: ready on any bar that has not closed through the stop, off
 * once one has, with no crossed level for the exit's hold test.
 */
export function restsWithoutCrossing(kind: GannEntryKind | string | null | undefined): boolean {
  return kind === "oldLevel" || kind === "hold";
}
