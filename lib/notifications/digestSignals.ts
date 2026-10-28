/**
 * GSPS — the "today's signals" lines of the evening digest (owner, 2026-10-28,
 * item 6). Intraday signals go by push and the bell only; the evening digest
 * carries one line each, so a member who was away still sees the day's moves
 * in one email instead of a stream of them.
 *
 * Read from the member's own bell rows (`in_app_notifications`, verdict
 * 'Intraday'), which already hold one notice per move by tier, so the digest
 * shows exactly what the member's bell showed. Notices that price neared an
 * entry are left out: they were live readings, stale by the evening.
 *
 * Mandate: no market content of its own (a summary of notices already
 * written), Dewey N/A. Rhythm: the session's stream closes into one evening
 * record, as the day itself closes.
 */

import { etDateKey } from "@/lib/market/session";
import { isNoticeTitle } from "@/lib/notifications/intradayBell";

/** The most signal lines one digest lists; the rest are counted. */
export const DIGEST_SIGNAL_LIMIT = 30;

export interface DigestBellRow {
  title: string;
  created_at: string;
}

/** "10:36 AM AAPL intraday, up: …", oldest first, today's New York day only. */
export function digestSignalLines(rows: DigestBellRow[], now: Date): { lines: string[]; more: number } {
  const today = etDateKey(now);
  const todays = rows
    .filter((r) => etDateKey(new Date(r.created_at)) === today && !isNoticeTitle(r.title))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  const lines = todays.slice(0, DIGEST_SIGNAL_LIMIT).map((r) => `${time.format(new Date(r.created_at))} ${r.title}`);
  return { lines, more: Math.max(0, todays.length - DIGEST_SIGNAL_LIMIT) };
}
