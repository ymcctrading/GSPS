/**
 * US equity session boundaries in America/New_York, DST-aware.
 *
 * This module is the ROOT FIX for the "NOK plots 8 candles some days, 9 others"
 * bug (Objection O-1 diagnosis / Suggestion S-1, S-5 in the review log). The bug
 * comes from bucketing bars by the UTC calendar day: because ET is UTC-5 (EST) or
 * UTC-4 (EDT), a naive UTC-midnight boundary slices a single trading day into two
 * buckets on some dates and pre/post-market ticks leak an extra "day" candle.
 *
 * We instead derive the ET calendar date for each timestamp using Intl (no extra
 * dependency, DST-correct) and classify each tick into PRE / RTH / POST relative
 * to 09:30–16:00 ET. Daily aggregation then groups strictly by ET trading date.
 */

const NY_TZ = "America/New_York";

/** Regular Trading Hours, minutes since ET midnight. */
export const RTH_OPEN_MIN = 9 * 60 + 30; // 09:30
export const RTH_CLOSE_MIN = 16 * 60; // 16:00
/** Pre-market conventionally starts 04:00 ET; post-market ends 20:00 ET. */
export const PRE_OPEN_MIN = 4 * 60; // 04:00
export const POST_CLOSE_MIN = 20 * 60; // 20:00

interface EtParts {
  /** ET calendar date as "YYYY-MM-DD". */
  date: string;
  /** Minutes since ET midnight (0–1439). */
  minutesOfDay: number;
  weekday: number; // 0=Sun .. 6=Sat
}

const dtf = new Intl.DateTimeFormat("en-US", {
  timeZone: NY_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  weekday: "short",
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Decompose a UTC epoch-ms into Eastern-Time calendar parts (DST-aware). */
export function toEtParts(epochMs: number): EtParts {
  const parts = dtf.formatToParts(new Date(epochMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = parseInt(get("hour"), 10);
  // Intl can emit "24" for midnight in some engines; normalize.
  if (hour === 24) hour = 0;
  const minute = parseInt(get("minute"), 10);
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  return {
    date,
    minutesOfDay: hour * 60 + minute,
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

export type SessionKind = "PRE" | "RTH" | "POST" | "CLOSED";

/** Classify a timestamp into its ET session. Weekends are CLOSED. */
export function classifySession(epochMs: number): SessionKind {
  const { minutesOfDay, weekday } = toEtParts(epochMs);
  if (weekday === 0 || weekday === 6) return "CLOSED";
  if (minutesOfDay >= RTH_OPEN_MIN && minutesOfDay < RTH_CLOSE_MIN) return "RTH";
  if (minutesOfDay >= PRE_OPEN_MIN && minutesOfDay < RTH_OPEN_MIN) return "PRE";
  if (minutesOfDay >= RTH_CLOSE_MIN && minutesOfDay < POST_CLOSE_MIN) return "POST";
  return "CLOSED";
}

/** Whether a timestamp is inside Regular Trading Hours (weekday 09:30–16:00 ET). */
export function isRegularHours(epochMs: number): boolean {
  return classifySession(epochMs) === "RTH";
}

/** The ET trading date ("YYYY-MM-DD") a timestamp belongs to. */
export function etTradingDate(epochMs: number): string {
  return toEtParts(epochMs).date;
}
