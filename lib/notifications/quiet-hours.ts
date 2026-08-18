/**
 * Quiet hours: is a given UTC instant inside a user's local quiet-hours
 * window? Pure and timezone-aware — the window is defined in the user's local
 * time-of-day (e.g. 22:00-06:00), not in UTC, so the comparison has to convert
 * `at` into that timezone's wall-clock time first.
 */

export interface QuietHoursPrefs {
  enabled: boolean;
  /** "HH:MM" (24h), local to `timezone`. */
  start: string;
  /** "HH:MM" (24h), local to `timezone`. */
  end: string;
  /** IANA timezone name, e.g. "America/New_York". */
  timezone: string;
}

/** Minutes since local midnight for `at`, in `timezone`. */
function localMinutesOfDay(at: Date, timezone: string): number {
  // Intl gives us the wall-clock hour/minute in the target zone without
  // needing a timezone database dependency.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/** Parses "HH:MM" into minutes since midnight. Malformed input reads as 0. */
function parseTimeOfDay(hhmm: string): number {
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!match) return 0;
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return hour * 60 + minute;
}

/**
 * Whether `at` (a UTC instant) falls inside the user's quiet-hours window.
 *
 * Handles the wraparound case where the window crosses midnight in local
 * time (e.g. 22:00-06:00): when `start > end`, "inside the window" means
 * "at or after start, OR before end" rather than the usual "between start
 * and end". When `start === end` the window is treated as empty (disabled),
 * matching a user who set no real range.
 */
export function isWithinQuietHours(prefs: QuietHoursPrefs, at: Date): boolean {
  if (!prefs.enabled) return false;

  const start = parseTimeOfDay(prefs.start);
  const end = parseTimeOfDay(prefs.end);
  if (start === end) return false;

  const nowMinutes = localMinutesOfDay(at, prefs.timezone);

  if (start < end) {
    // Simple same-day window, e.g. 09:00-17:00.
    return nowMinutes >= start && nowMinutes < end;
  }

  // Wraps past midnight, e.g. 22:00-06:00.
  return nowMinutes >= start || nowMinutes < end;
}
