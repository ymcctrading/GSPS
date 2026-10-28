/**
 * A-EXIT-05 at the point of entry (*Tunnel Thru the Air*, W022 p.113, Tier A:
 * go flat before you travel). Inside the away window (`awayReminderDue`), a new
 * entry carries the close-out reminder back with the order, so the trader sees
 * it where the exposure is opened, not only on the Dashboard. A notice only:
 * the order is still placed, and a protective order never carries it. The
 * portfolio manager opens nothing new in the window (portfolio-manager.ts).
 * The replay models no trader absence, so the rule does not apply there.
 *
 * The twice-yearly rest window (M-K4, *Truth of the Stock Tape* Ch. VII
 * pp. 22-25: close out twice a year and rest) is read the same way: the
 * portfolio manager and the automated pyramid adds already open nothing in
 * it, so a person's own new entry there carries the rest reminder, unless
 * the trader turned it off or dismissed it (audit T-07, 2026-10-28; it had
 * carried only the away reminder).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AWAY_REMINDER_COPY,
  REST_REMINDER_COPY,
  awayReminderDue,
  resolveGannRulePrefs,
  restReminderDue,
  type GannRulePrefs,
} from "@/lib/gann/traderPrefs";

export async function readGannRulePrefs(supabase: SupabaseClient, userId: string): Promise<GannRulePrefs | null> {
  try {
    const { data, error } = await supabase.from("settings").select("prefs").eq("user_id", userId).maybeSingle();
    if (error) return null;
    return resolveGannRulePrefs((data as { prefs?: unknown } | null)?.prefs ?? null);
  } catch {
    return null;
  }
}

/** The close-out reminder when the trader's away or rest window is open, else null. */
export async function readAwayNotice(supabase: SupabaseClient, userId: string, now: Date = new Date()): Promise<string | null> {
  const prefs = await readGannRulePrefs(supabase, userId);
  return prefs ? closeOutNotice(prefs, now) : null;
}

/** Pure: the away reminder first (it names a date), else the rest reminder. */
export function closeOutNotice(prefs: GannRulePrefs, now: Date = new Date()): string | null {
  if (awayReminderDue(prefs, now)) return AWAY_REMINDER_COPY;
  if (restReminderDue(prefs, now)) return REST_REMINDER_COPY;
  return null;
}

/** Adds the notice to a placed order's `warning`, beside any warning it already carries. */
export function withAwayNotice<T extends { status: number; body: Record<string, unknown> }>(placed: T, notice: string | null): T {
  if (!notice || placed.status !== 200) return placed;
  const prior = typeof placed.body.warning === "string" && placed.body.warning ? `${placed.body.warning} ` : "";
  return { ...placed, body: { ...placed.body, warning: `${prior}${notice}`, awayNotice: notice } };
}
