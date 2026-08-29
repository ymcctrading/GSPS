/**
 * Pre-entry expiry and trigger-extension checks.
 *
 * "Signals must expire after a defined number of closed operating-timeframe
 * bars" and "Entry must not occur after excessive price extension beyond the
 * planned trigger tolerance" — both are pure comparisons against the plan's
 * own coordinates, kept separate from the state-machine transitions in
 * `transitions.ts` so a caller can check them on every bar close without
 * constructing an event.
 */

/** True once `barsSinceGenerated` has reached or passed the plan's bar-count expiry. */
export function isExpiredByBars(barsSinceGenerated: number, expiresAfterBars: number): boolean {
  return barsSinceGenerated >= expiresAfterBars;
}

/** True once the wall-clock deadline has passed. */
export function isExpiredByClock(nowIso: string, expiresAtIso: string): boolean {
  return new Date(nowIso).getTime() >= new Date(expiresAtIso).getTime();
}

/**
 * Whether an entry at `price` is still inside the plan's trigger tolerance.
 * `direction` decides which side counts as "extension": a long can't chase a
 * trigger that has already run away upward past `entryTrigger + tolerance`; a
 * short mirrors that downward.
 */
export function withinTriggerTolerance(
  direction: "bullish" | "bearish",
  price: number,
  entryTrigger: number,
  entryLimitTolerance: number,
): boolean {
  const tolerance = Math.abs(entryLimitTolerance);
  return direction === "bullish"
    ? price <= entryTrigger + tolerance
    : price >= entryTrigger - tolerance;
}
