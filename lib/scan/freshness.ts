/**
 * How old a stored scan is, in market sessions.
 *
 * The four price columns in `daily_scans` are 15-minute-bar levels: an entry a
 * penny beyond a signal candle, a stop a penny beyond the other side. Within
 * the session that produced them they are precise. A day later they describe a
 * candle the market has long since left behind — and they still *look* precise,
 * which is the dangerous part. A reader cannot tell Friday's plan from today's
 * by looking at it, so the age has to be stated.
 *
 * Sessions rather than calendar days: on a Saturday, Friday's scan is the most
 * recent one that could exist, and calling it a day old would be noise. Come
 * Monday the same scan is genuinely a session behind.
 *
 * Market holidays are not modelled. A scan taken before one reads a session
 * staler than it is — the direction that over-warns, which is the right way to
 * be wrong about whether a price is current.
 */

import { etDateKey, etParts } from "@/lib/market/session";

export type ScanSeverity = "current" | "previous-session" | "stale";

export interface ScanFreshness {
  /** Completed sessions between the scan and now. 0 means nothing has closed since. */
  sessionsBehind: number;
  severity: ScanSeverity;
  /** True once the levels belong to a session that has ended. */
  stale: boolean;
}

/** Beyond this the exact count stops being interesting; it is simply old. */
const MAX_SESSIONS = 30;

function parseUtcDate(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function isWeekday(d: Date): boolean {
  const day = d.getUTCDay();
  return day !== 0 && day !== 6;
}

/**
 * Weekdays strictly after `from` and up to and including `to`. A scan and the
 * moment it is read on the same day gives 0; Friday read on Monday gives 1.
 */
function sessionsBetween(from: Date, to: Date): number {
  let count = 0;
  const cursor = new Date(from.getTime());
  while (count < MAX_SESSIONS) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor.getTime() > to.getTime()) break;
    if (isWeekday(cursor)) count += 1;
  }
  return count;
}

export function scanFreshness(scanDate: string | null, now: Date): ScanFreshness {
  const fresh = (sessionsBehind: number): ScanFreshness => ({
    sessionsBehind,
    severity:
      sessionsBehind === 0 ? "current" : sessionsBehind === 1 ? "previous-session" : "stale",
    stale: sessionsBehind > 0,
  });

  // Both sides read as trading dates. `scan_date` is written in Eastern by
  // runMarketScan, so comparing it against a UTC "today" would report every
  // evening scan as a session stale between 20:00 ET and midnight.
  const from = scanDate ? parseUtcDate(scanDate) : null;
  const to = parseUtcDate(etDateKey(now));
  // An unreadable or absent date is not evidence of staleness — there is simply
  // no list to qualify, and the caller renders its own empty state.
  if (!from || !to) return fresh(0);

  // A scan dated ahead of today is a clock disagreement, not a fresher list.
  if (from.getTime() >= to.getTime()) return fresh(0);

  return fresh(sessionsBetween(from, to));
}

/** 09:30 ET, in minutes since midnight. */
const REGULAR_OPEN = 9 * 60 + 30;

/**
 * Whether a plan's levels come from a session earlier than the one it is dated
 * for.
 *
 * The scan reads *closed* 15-minute bars, so what it can see depends entirely
 * on when it runs. The 12:30 UTC cron fires at 08:30 ET — an hour before the
 * open — where the most recent closed bar belongs to yesterday. That run is
 * dated today and overwrites last evening's list, so by date alone it looks
 * like the freshest thing available while being priced off tape that has
 * already been superseded by the overnight session and the opening auction.
 *
 * The 17:30 ET run has the opposite property: also outside market hours, but
 * its bars are that day's, which is why the test is "before the open" and not
 * "outside the session".
 *
 * A weekend run counts too — Saturday's scan reads Friday's bars.
 */
export function pricedBeforeSession(
  scanDate: string | null,
  scannedAt: string | null | undefined,
): boolean {
  if (!scanDate || !scannedAt) return false;

  const at = new Date(scannedAt);
  if (Number.isNaN(at.getTime())) return false;

  // A run dated to a different day than it happened on is a staleness question,
  // not a within-session one, and the sessions-behind count already reports it.
  if (etDateKey(at) !== scanDate) return false;

  const { minutes, weekday } = etParts(at);
  if (weekday === 0 || weekday === 6) return true; // no session that day to be inside of
  return minutes < REGULAR_OPEN;
}
