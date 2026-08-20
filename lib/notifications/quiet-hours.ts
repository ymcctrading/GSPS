/**
 * Quiet hours: a window, in the user's local timezone, during which no
 * notification is sent regardless of score. Stored as minutes-since-midnight
 * so the check never has to parse a time string per dispatch.
 */

/** Minutes since local midnight, for `date` in `timeZone`. */
export function minutesSinceLocalMidnight(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/**
 * Whether `date` falls inside the [start, end) quiet-hours window.
 *
 * Both bounds unset means no quiet hours are configured. `start > end` is an
 * overnight window (e.g. 22:00-06:00) that wraps past midnight.
 */
export function isQuietHours(
  date: Date,
  timeZone: string,
  quietHoursStart: number | null,
  quietHoursEnd: number | null,
): boolean {
  if (quietHoursStart == null || quietHoursEnd == null) return false;
  if (quietHoursStart === quietHoursEnd) return false;

  const nowMinutes = minutesSinceLocalMidnight(date, timeZone);
  if (quietHoursStart < quietHoursEnd) {
    return nowMinutes >= quietHoursStart && nowMinutes < quietHoursEnd;
  }
  // Overnight window: quiet from start through midnight, then midnight through end.
  return nowMinutes >= quietHoursStart || nowMinutes < quietHoursEnd;
}
