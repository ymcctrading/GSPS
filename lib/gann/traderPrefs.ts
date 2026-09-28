/**
 * The trader's own switches for three of Gann's rules (project owner,
 * 2026-09-28). Stored under `settings.prefs.gannRules`, beside the other
 * per-feature preferences, so no migration is needed.
 *
 * - `roundNumberNotices`: show the "approaching a round number" notice on the
 *   setup card, chart and order ticket (`lib/gann/evenFigures.ts`). Default on.
 * - `restReminder`: Gann's rule to close out every trade twice a year and rest
 *   (*Truth of the Stock Tape*, Book I). A reminder only; nothing is ever
 *   closed for the trader. Default on.
 * - `autoOrderRoundNumbers`: whether the autonomous portfolio manager may
 *   place an entry just short of a round number when the plan's own breakout
 *   level isn't that number. Default off, following Gann: buy and sell just
 *   before the figures, not into them.
 *
 * The rest windows are an engineering choice, labelled as such: Gann gives
 * "twice a year" without dates, so the reminder uses the two half-year turns
 * of his seasonal calendar (the June and December solstice dates, June 21 and
 * December 21, from which his seasonal counts run) and stays up for
 * `REST_WINDOW_DAYS` unless dismissed.
 *
 * Three-question basis:
 * 1. Gann: as cited, Tier A (the rest rule; the even figures in evenFigures.ts).
 * 2. Cycles: the rest is a fixed half-yearly period, a scheduling choice, not a
 *    claim that markets turn then; Dewey's checklist does not apply.
 * 3. Hermetic: Rhythm. Activity and rest alternate: the trader's own cycle has
 *    an out-breath as well as an in-breath, and the reminder returns every
 *    half year rather than firing once. Mentalism fits the rest too: Gann's
 *    reason is the trader's judgment, which tires with constant exposure.
 */

import { etDateKey } from "@/lib/market/session";

export interface GannRulePrefs {
  roundNumberNotices: boolean;
  restReminder: boolean;
  autoOrderRoundNumbers: boolean;
  /** The rest period (e.g. "2026-12") the trader dismissed, so it doesn't reappear. */
  restDismissedFor: string | null;
}

export const DEFAULT_GANN_RULE_PREFS: GannRulePrefs = {
  roundNumberNotices: true,
  restReminder: true,
  autoOrderRoundNumbers: false,
  restDismissedFor: null,
};

export const REST_WINDOW_DAYS = 10;
/** Month-day the two rest windows open (ET). */
export const REST_WINDOW_STARTS = ["06-21", "12-21"] as const;

export function resolveGannRulePrefs(prefs: unknown): GannRulePrefs {
  const raw = (prefs && typeof prefs === "object" ? (prefs as Record<string, unknown>).gannRules : null) as
    | Record<string, unknown>
    | null
    | undefined;
  if (!raw || typeof raw !== "object") return { ...DEFAULT_GANN_RULE_PREFS };
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    roundNumberNotices: bool(raw.roundNumberNotices, DEFAULT_GANN_RULE_PREFS.roundNumberNotices),
    restReminder: bool(raw.restReminder, DEFAULT_GANN_RULE_PREFS.restReminder),
    autoOrderRoundNumbers: bool(raw.autoOrderRoundNumbers, DEFAULT_GANN_RULE_PREFS.autoOrderRoundNumbers),
    restDismissedFor: typeof raw.restDismissedFor === "string" ? raw.restDismissedFor : null,
  };
}

export interface RestWindow {
  /** Identifies the period, e.g. "2026-06" or "2026-12". */
  period: string;
  opens: string;
  closes: string;
}

/** The rest window today falls in, if any. */
export function currentRestWindow(now: Date = new Date()): RestWindow | null {
  const today = etDateKey(now);
  const year = Number(today.slice(0, 4));
  for (const y of [year - 1, year]) {
    for (const md of REST_WINDOW_STARTS) {
      const opens = `${y}-${md}`;
      const close = new Date(`${opens}T12:00:00Z`);
      close.setUTCDate(close.getUTCDate() + REST_WINDOW_DAYS - 1);
      const closes = close.toISOString().slice(0, 10);
      if (today >= opens && today <= closes) return { period: `${y}-${md.slice(0, 2)}`, opens, closes };
    }
  }
  return null;
}

export function restReminderDue(prefs: GannRulePrefs, now: Date = new Date()): RestWindow | null {
  if (!prefs.restReminder) return null;
  const w = currentRestWindow(now);
  if (!w || prefs.restDismissedFor === w.period) return null;
  return w;
}

export const REST_REMINDER_COPY =
  "Twice a year, close out every trade and rest for a while before starting again. Constant exposure wears down judgment, and a clear head sees the next move better. This is a reminder only: nothing is closed for you.";
