/**
 * The on-demand intraday scan's per-tier refresh budget.
 * -----------------------------------------------------------------------------
 * Project owner direction, 2026-09-30: the intraday setup cards are "updated a
 * certain amount of times per day/week, dependent upon tiers". The numbers are
 * `EntitlementPolicy.intradayRefreshesPerDay` / `…PerWeek`
 * (`lib/entitlements/policy.ts`); this module turns them into a decision.
 *
 * What counts as a refresh: one completed on-demand scan by the signed-in user.
 * Each is recorded as a `scan_executions` row with `source = 'intraday'` — a
 * value that table's check constraint has always allowed and that the route
 * already wrote whenever a scan found an alert (`app/api/intraday-scan/route.ts`).
 * It now writes one for every completed scan, alert or not, because a scan that
 * finds nothing still cost a refresh. Counting from that table needs no new
 * schema, so this ships without a migration to apply.
 *
 * Day = the America/New_York calendar day (`etDateKey`, as the usage ledger
 * uses); week = the trailing seven days, not a calendar week, so the budget
 * doesn't snap back on a Monday. Both apply; whichever runs out first blocks.
 *
 * This is a budget, not a lock: the count is read before the scan and the row
 * written after it, so two requests in flight at once can both pass. The cost of
 * that is one extra refresh, which is why this is not built on the atomic
 * `reserve_usage_slot` ledger — that would need a migration to admit a new usage
 * key, and a precise ceiling on a soft product limit isn't worth one.
 *
 * Three-question basis (AGENTS.md): (1) Gann: none — an access rule. Gann's own
 * caution that the money is in the swings, not in day-to-day trading, is a
 * reason to meter how often a person is prompted to look; it is not a rule this
 * code derives its numbers from. (2) Cycles: no periodicity claim. (3) Hermetic:
 * Rhythm — the budget renews on a fixed cycle (each ET day, each rolling week)
 * rather than draining once, the same returning-wheel shape as the rest of this
 * platform's recurring processes; and Polarity, as in the tier ladder generally.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { etDateKey } from "@/lib/market/session";
import type { Limit } from "@/lib/entitlements/policy";

/** Trailing window for the weekly budget. */
export const REFRESH_WEEK_DAYS = 7;

export interface IntradayRefreshUsage {
  today: number;
  week: number;
}

export interface IntradayRefreshBudget {
  limitPerDay: Limit;
  limitPerWeek: Limit;
  usedToday: number;
  usedThisWeek: number;
  remainingToday: number | "unlimited";
  remainingThisWeek: number | "unlimited";
  /** True when nothing is metered: the panel may then refresh on its own timer. */
  automatic: boolean;
  /** Whether one more refresh may run now. */
  allowed: boolean;
  blockedBy: "day" | "week" | null;
}

function remaining(limit: Limit, used: number): number | "unlimited" {
  return limit === "unlimited" ? "unlimited" : Math.max(0, limit - used);
}

export function computeIntradayRefreshBudget(
  limits: { perDay: Limit; perWeek: Limit },
  used: IntradayRefreshUsage,
): IntradayRefreshBudget {
  const remainingToday = remaining(limits.perDay, used.today);
  const remainingThisWeek = remaining(limits.perWeek, used.week);
  const blockedBy = remainingToday === 0 ? "day" : remainingThisWeek === 0 ? "week" : null;
  return {
    limitPerDay: limits.perDay,
    limitPerWeek: limits.perWeek,
    usedToday: used.today,
    usedThisWeek: used.week,
    remainingToday,
    remainingThisWeek,
    automatic: limits.perDay === "unlimited" && limits.perWeek === "unlimited",
    allowed: blockedBy === null,
    blockedBy,
  };
}

/** One sentence for the person who has run out, saying which budget and when it renews. */
export function describeRefreshBlock(budget: IntradayRefreshBudget): string {
  if (budget.blockedBy === "day") {
    return `You've used all ${budget.limitPerDay} of today's intraday refreshes. They renew at the start of the next trading day.`;
  }
  if (budget.blockedBy === "week") {
    return `You've used all ${budget.limitPerWeek} intraday refreshes for the past seven days. One frees up as the oldest ages out.`;
  }
  return "";
}

/**
 * Refreshes this profile has run today (ET) and in the trailing seven days. A
 * read failure counts as none used — under-restricts rather than blocking a
 * user's scan on a bookkeeping hiccup, the same choice
 * `countProIntradaySetupsShownToday` makes.
 */
export async function countIntradayRefreshes(
  supabase: SupabaseClient,
  profileId: string,
  now: Date = new Date(),
): Promise<IntradayRefreshUsage> {
  const since = new Date(now.getTime() - REFRESH_WEEK_DAYS * 24 * 3600_000).toISOString();
  const { data, error } = await supabase
    .from("scan_executions")
    .select("started_at")
    .eq("profile_id", profileId)
    .eq("source", "intraday")
    .gte("started_at", since)
    .limit(1000);
  if (error || !data) {
    if (error) console.error(`[intraday-refresh] could not count refreshes — ${error.message}`);
    return { today: 0, week: 0 };
  }

  const todayEt = etDateKey(now);
  let today = 0;
  for (const row of data as { started_at: string }[]) {
    if (etDateKey(new Date(row.started_at)) === todayEt) today += 1;
  }
  return { today, week: data.length };
}

/**
 * Record one completed refresh, returning the row's id (which the route hands
 * to the monitor pass as its evaluation id), or null if the write failed — the
 * scan itself has already succeeded and must not be lost to a bookkeeping write.
 */
export async function recordIntradayRefresh(
  supabase: SupabaseClient,
  profileId: string,
  counts: { eligible: number; visible: number },
  now: Date = new Date(),
): Promise<string | null> {
  const { data, error } = await supabase
    .from("scan_executions")
    .insert({
      profile_id: profileId,
      source: "intraday",
      started_at: now.toISOString(),
      finished_at: now.toISOString(),
      eligible_count: counts.eligible,
      visible_count: counts.visible,
      result_fresh_as_of: now.toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error(`[intraday-scan] scan execution not recorded — ${error?.message}`);
    return null;
  }
  return data.id as string;
}
