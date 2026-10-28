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

import { equitySession, etDateKey } from "@/lib/market/session";

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
 * When a pre-entry plan ends unless its stop retires it first (Q17, owner
 * 2026-10-16: the 3-20 bar clock is replaced on Gann's terms). A plan's
 * trigger and stop are read from completed daily sessions, so they hold for
 * the session the plan trades in; once that session's bar completes, the next
 * read of the swing chart is what replaces them (Overnight Chart rule 4, NSTD
 * Rule 6: a new trade takes new structure, never the old levels resumed). The
 * replay arms the same way, one trigger per session (`lib/backtest/replay.ts`).
 *
 * US equities: the next regular-session close at or after `generatedAt`, so a
 * plan made after the close or at a weekend lives through the next session
 * (`equitySession` skips holidays and ends an early close at 1:00 PM).
 * Other markets: the end of the ET day, when their daily bar completes, the
 * same day key the scan reads sessions by (`etDateKey`).
 */
export function sessionCloseDeadline(generatedAt: string, market: string): string {
  const MINUTE = 60_000;
  let t = Math.floor(new Date(generatedAt).getTime() / MINUTE) * MINUTE;
  if (market !== "us_equity") {
    const day = etDateKey(new Date(t));
    // Bounded: a day plus a DST hour.
    for (let i = 0; i < 26 * 60 && etDateKey(new Date(t)) === day; i++) t += MINUTE;
    return new Date(t).toISOString();
  }
  // Bounded walk: a long weekend to the next open, then the session itself.
  const max = 5 * 24 * 60;
  let i = 0;
  while (i++ < max && equitySession(new Date(t)) !== "regular") t += MINUTE;
  while (i++ < max && equitySession(new Date(t)) === "regular") t += MINUTE;
  return new Date(t).toISOString();
}
