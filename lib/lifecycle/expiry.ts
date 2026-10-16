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

import { equitySession } from "@/lib/market/session";

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

/**
 * The deadline `bars` closed bars of `intervalMs` after `generatedAt`,
 * counting only bars the market is open for. "Signals must expire after a
 * defined number of closed operating-timeframe bars" — a plan generated after
 * the equity close used to run out overnight on the wall clock, before a
 * single bar it could confirm on had formed, so no plan ever armed. Equities
 * count regular-session bars (09:30-16:00 ET, weekdays; holidays are not
 * known here, so a holiday still counts as a session). Other markets keep
 * the wall clock.
 *
 * Interim: the parity work (#309) replaces the expiry clock with Gann's
 * stop-breach retirement, and this helper goes with it.
 */
export function sessionBarsDeadline(
  generatedAt: string,
  bars: number,
  intervalMs: number,
  /** A plan's `market`; only US equities have a closed session to skip. */
  market: string,
): string {
  const start = new Date(generatedAt).getTime();
  if (market !== "us_equity") return new Date(start + bars * intervalMs).toISOString();
  let t = start;
  let counted = 0;
  // Bounded walk: two weeks of steps covers any weekend plus a long session count.
  const maxSteps = Math.ceil((14 * 24 * 3600 * 1000) / intervalMs) + bars;
  for (let i = 0; i < maxSteps && counted < bars; i++) {
    t += intervalMs;
    // A bar ending at t is a session bar when its opening moment is in the regular session.
    if (equitySession(new Date(t - intervalMs)) === "regular") counted++;
  }
  return new Date(t).toISOString();
}
