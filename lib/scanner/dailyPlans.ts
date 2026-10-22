/**
 * GSPS — the daily plans standing on a set of symbols, for the intraday scan
 * (to time the plan's own entry) and the evening focus list (a plan whose
 * entry is within a day's range). Moved here from the intraday route so both
 * read the same plans.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyPlanLevels } from "@/lib/scanner/intraday";

/**
 * The daily plan standing on each symbol: the freshest Execute or Watch plan
 * with an entry and a stop, from the daily lists (`daily_scans`) or a monitor
 * (`active_monitors`, which the symbol page's own scan keeps current). An
 * on-demand scan reads the caller's own monitors; a system scan reads any,
 * since the plan is the symbol's, priced the same for everyone.
 *
 * A Reject has no plan to time, so it is left out. A read failure leaves the
 * map empty, and "Daily plan's level held" simply doesn't fire.
 *
 * The lists are read from their latest scan date only (review, 2026-10-21):
 * `daily_scans` keeps a row per scan date, so a plan an older day listed and
 * the latest scan dropped is no longer the symbol's plan. In Gann's method a
 * new reading of the swing structure replaces the old plan; it is never
 * resumed from older levels (NSTD Rule 6; AGENTS.md, F3.7).
 */
export async function loadDailyPlans(
  supabase: SupabaseClient,
  symbols: string[],
  userId: string | null,
): Promise<Map<string, DailyPlanLevels>> {
  const plans = new Map<string, { plan: DailyPlanLevels; at: number }>();
  if (symbols.length === 0) return new Map();
  const since = new Date(Date.now() - 4 * 86_400_000);

  let monitors = supabase
    .from("active_monitors")
    .select("symbol, direction, entry, stop_loss, take_profit_1, master_profit, output_state, last_evaluated_at, entry_awaits_crossing")
    .in("symbol", symbols)
    .in("state", ["WATCH", "EXECUTE"])
    .gte("last_evaluated_at", since.toISOString())
    .not("entry", "is", null)
    .not("stop_loss", "is", null);
  if (userId) monitors = monitors.eq("profile_id", userId);

  const latestScan = async () => {
    const { data: latest } = await supabase
      .from("daily_scans")
      .select("scan_date")
      .order("scan_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latest?.scan_date) return { data: [] };
    return supabase
      .from("daily_scans")
      .select("symbol, direction, entry, stop_loss, take_profit_1, master_profit, output_state, updated_at, awaits:detail->entryAwaitsCrossing")
      .eq("scan_date", latest.scan_date)
      .in("symbol", symbols)
      .in("output_state", ["Execute", "Watch"])
      .gte("updated_at", since.toISOString());
  };

  const [{ data: monitorRows }, { data: scanRows }] = await Promise.all([monitors, latestScan()]);

  const consider = (row: {
    symbol: string;
    direction: string | null;
    entry: number | string | null;
    stop_loss: number | string | null;
    take_profit_1: number | string | null;
    master_profit: number | string | null;
    output_state: string | null;
    at: string | null;
    awaitsCrossing: boolean | null;
  }) => {
    const direction = row.direction === "bullish" ? "up" : row.direction === "bearish" ? "down" : null;
    const verdict = row.output_state === "Execute" ? "Execute" : row.output_state === "Watch" ? "Watch" : null;
    const entry = Number(row.entry);
    const stop = Number(row.stop_loss);
    const at = row.at ? Date.parse(row.at) : NaN;
    if (!direction || !verdict || !(entry > 0) || !(stop > 0) || Number.isNaN(at)) return;
    // A plan whose stop sits on the wrong side of its entry is not a plan.
    if (direction === "up" ? stop >= entry : stop <= entry) return;
    const prior = plans.get(row.symbol);
    if (prior && prior.at >= at) return;
    const tp1 = row.take_profit_1 == null ? null : Number(row.take_profit_1);
    const mtp = row.master_profit == null ? null : Number(row.master_profit);
    plans.set(row.symbol, {
      plan: {
        direction,
        verdict,
        entry,
        stop,
        tp1: tp1 != null && tp1 > 0 ? tp1 : null,
        mtp: mtp != null && mtp > 0 ? mtp : null,
        awaitsCrossing: row.awaitsCrossing,
      },
      at,
    });
  };

  for (const r of monitorRows ?? []) consider({ ...r, at: r.last_evaluated_at, awaitsCrossing: r.entry_awaits_crossing ?? null });
  for (const r of scanRows ?? []) {
    const flag = (r as { awaits?: unknown }).awaits;
    consider({ ...r, at: r.updated_at, awaitsCrossing: typeof flag === "boolean" ? flag : null });
  }

  return new Map([...plans].map(([symbol, { plan }]) => [symbol, plan]));
}
