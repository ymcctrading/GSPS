/**
 * A-EXIT-05 at the point of entry (*Tunnel Thru the Air*, W022 p.113, Tier A:
 * go flat before you travel). Inside the away window (`awayReminderDue`), a new
 * entry carries the close-out reminder back with the order, so the trader sees
 * it where the exposure is opened, not only on the Dashboard. A notice only:
 * the order is still placed, and a protective order never carries it. The
 * portfolio manager opens nothing new in the window (portfolio-manager.ts).
 * The replay models no trader absence, so the rule does not apply there.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { AWAY_REMINDER_COPY, awayReminderDue, resolveGannRulePrefs, type GannRulePrefs } from "@/lib/gann/traderPrefs";

export async function readGannRulePrefs(supabase: SupabaseClient, userId: string): Promise<GannRulePrefs | null> {
  try {
    const { data, error } = await supabase.from("settings").select("prefs").eq("user_id", userId).maybeSingle();
    if (error) return null;
    return resolveGannRulePrefs((data as { prefs?: unknown } | null)?.prefs ?? null);
  } catch {
    return null;
  }
}

/** The close-out reminder when the trader's away window is open, else null. */
export async function readAwayNotice(supabase: SupabaseClient, userId: string, now: Date = new Date()): Promise<string | null> {
  const prefs = await readGannRulePrefs(supabase, userId);
  return prefs && awayReminderDue(prefs, now) ? AWAY_REMINDER_COPY : null;
}

/** Adds the notice to a placed order's `warning`, beside any warning it already carries. */
export function withAwayNotice<T extends { status: number; body: Record<string, unknown> }>(placed: T, notice: string | null): T {
  if (!notice || placed.status !== 200) return placed;
  const prior = typeof placed.body.warning === "string" && placed.body.warning ? `${placed.body.warning} ` : "";
  return { ...placed, body: { ...placed.body, warning: `${prior}${notice}`, awayNotice: notice } };
}
