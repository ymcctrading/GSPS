/**
 * GSPS — automated trading for the showcase demo profile.
 *
 * The demo account (`profiles.is_demo`) is meant to always have something
 * real going on when a prospective investor, partner, or user opens it: a
 * live position, taken by the app's own signals, sized and managed the same
 * way a real novice's would be. This module is what makes that true without
 * a human ever tapping "Buy" — it runs the exact pipeline Guided Decision
 * Mode uses (`candidateSymbols` → `buildRecommendations` →
 * `placeSimulatedOrder`, see lib/guided/service.ts), just with the
 * `auth.getUser()` session gate removed and the demo account's id supplied
 * directly. Nothing about the trading rules is relaxed for the demo
 * account — it clears the same Execute-only bar, respects the same risk/
 * budget/cap ceilings — because the point is to show what the product
 * actually does, not a more exciting fiction of it.
 *
 * Sizing uses the trading unit, not raw equity (A-RISK-04):
 * `readGuidedAccount`'s `riskCapital` starts at the starting balance, doubles
 * only once profits equal it, and holds on a long run of wins. A loss still
 * shrinks it.
 *
 * Removed 2026-10-16 (owner, Q30; NONGANN #8): the A/B strategy "arms" that
 * moved its caps by date, the favourite symbol picked by win rate, and the
 * quiet-day buys into open positions. None has a Gann source, and the last
 * could add to a losing trade, which Gann forbids. Gann adds only to a winner,
 * on a crossing (`lib/gann/pyramid.ts`), and automated adds are not placed
 * yet, so on a day nothing clears the Execute bar this account does nothing.
 *
 * **Entry confirmation (owner decision 4, 2026-09-27).** A recommendation is
 * placed only once its entry has confirmed on today's closed bars (touch, a
 * close through the trigger by the 3-point-rule buffer, a retest, a close that
 * held), the same rule Guided Mode's execute now applies, so this account
 * still shows exactly what Guided Mode does. The measured reason: the
 * confirmed entry beat the resting stop-entry on the full universe (+0.190R vs
 * −0.155R, docs/replay-runs/2026-09-26-766sym-NOTES.md). An unconfirmed setup
 * is refused by `placeSimulatedOrder` (`awaiting_confirmation`) and skipped
 * for this run, not placed early. See `lib/lifecycle/confirmNow.ts`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { killSwitchRefusal } from "@/lib/trade/kill-switch";
import { placeSimulatedOrder } from "@/lib/trade/place-order";
import { guidedOrder } from "@/lib/guided/order";
import {
  buildRecommendations,
  candidateSymbols,
  hasLiveBrokerage,
  readGuidedAccount,
  type Recommendation,
} from "@/lib/guided/service";
import { readCapUsage } from "@/lib/guided/caps";
import { resolveGuidedCaps } from "@/lib/guided/config";

export interface DemoAutoTradeResult {
  ran: boolean;
  reason?: string;
  demoUserId?: string;
  placed: { symbol: string; side: "buy" | "sell"; qty: number; notionalUsd: number }[];
  skipped: { symbol: string; reasons: string[] }[];
  blockedReason: string | null;
}

/**
 * The single demo profile's user id, or null if none is marked yet.
 * `create-demo-profile.mjs` is what sets `is_demo`; this just reads it back.
 */
async function findDemoUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("is_demo", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

/**
 * Symbols the intraday scanner has flagged recently (`intraday_system_alerts`,
 * written by the GitHub Actions-scheduled system pass — see
 * .github/workflows/intraday-scan.yml). A three-hour window: wide enough to
 * catch a signal from the last time this job ran even on an infrequent
 * schedule, narrow enough that a momentum alert from this morning doesn't
 * still look "current" by the close. This is a second source of candidate
 * *symbols* only — same as the daily scanner's list, every one of them still
 * gets a full live re-scan in `buildRecommendations` before anything is
 * eligible to trade, so a stale or noisy intraday tick can suggest a look,
 * never force a trade.
 */
async function intradayCandidateSymbols(supabase: SupabaseClient, now: Date): Promise<string[]> {
  const since = new Date(now.getTime() - 3 * 3600_000).toISOString();
  const { data } = await supabase
    .from("intraday_system_alerts")
    .select("symbol")
    .gte("poll_cycle_timestamp", since)
    .order("score", { ascending: false })
    .limit(20);
  const rows = (data ?? []) as { symbol: string }[];
  return [...new Set(rows.map((r) => r.symbol.toUpperCase()))];
}

/**
 * Runs one pass of automated trading for the demo account: new entries when
 * the daily/weekly/deployed caps allow one. Meant to be called from a
 * scheduled, bearer-secret-protected route (see app/api/demo/auto-trade) —
 * there is no per-request session here, `supabase` must be a service-role
 * client so RLS doesn't block reading/writing an account that isn't the
 * caller's own.
 */
export async function runDemoAutoTrade(supabase: SupabaseClient, now: Date = new Date()): Promise<DemoAutoTradeResult> {
  const empty: Omit<DemoAutoTradeResult, "ran" | "reason"> = {
    placed: [],
    skipped: [],
    blockedReason: null,
  };

  const halted = killSwitchRefusal();
  if (halted) return { ran: false, reason: halted.error, ...empty };

  const demoUserId = await findDemoUserId(supabase);
  if (!demoUserId) return { ran: false, reason: "No profile is marked is_demo.", ...empty };

  if (await hasLiveBrokerage(supabase, demoUserId)) {
    return { ran: false, reason: "Demo account has a live brokerage connected — refusing to auto-trade it.", ...empty };
  }

  const { data: settingsRow } = await supabase
    .from("settings")
    .select("prefs")
    .eq("user_id", demoUserId)
    .maybeSingle();
  const caps = resolveGuidedCaps((settingsRow as { prefs?: unknown } | null)?.prefs ?? null);

  const account = await readGuidedAccount(supabase, demoUserId);
  const usage = readCapUsage(account.openSymbols);

  if (usage.blockedReason) {
    return { ran: true, demoUserId, blockedReason: usage.blockedReason, placed: [], skipped: [] };
  }

  // Both scanner sources feed the same candidate list — the daily scanner's
  // published shortlist and whatever the intraday scanner has flagged
  // recently. Neither list is trusted as-is: buildRecommendations re-scans
  // every symbol live and only Execute-rated setups ever become a trade.
  const [dailyCandidates, intradayCandidates] = await Promise.all([
    candidateSymbols(supabase),
    intradayCandidateSymbols(supabase, now),
  ]);
  const rawCandidates = [...new Set([...dailyCandidates, ...intradayCandidates])];
  if (rawCandidates.length === 0) {
    return { ran: true, demoUserId, blockedReason: null, placed: [], skipped: [] };
  }

  const built = await buildRecommendations({
    symbols: rawCandidates,
    account,
    caps,
    capitalHeldUsd: usage.capitalHeldUsd,
    openMarkets: usage.openMarkets,
    now,
  });

  // No daily trade count (Q8, Q12): Gann's capital rules, applied inside
  // buildRecommendations and again at the order, bound what is placed.
  const toPlace = built.recommendations;

  const placed: DemoAutoTradeResult["placed"] = [];
  for (const rec of toPlace) {
    const result = await placeRecommendation(supabase, demoUserId, rec);
    if (result) placed.push(result);
  }

  return {
    ran: true,
    demoUserId,
    blockedReason: null,
    placed,
    skipped: built.skipped,
  };
}

/** Places one recommendation on the demo account. Exported for its test. */
export async function placeRecommendation(
  supabase: SupabaseClient,
  userId: string,
  rec: Recommendation,
): Promise<DemoAutoTradeResult["placed"][number] | null> {
  // The same order Guided Mode places for this recommendation.
  const placed = await placeSimulatedOrder(
    supabase,
    userId,
    guidedOrder({ symbol: rec.symbol, side: rec.action, qty: rec.qty, referencePrice: rec.currentPrice, levels: rec.why }),
  );
  if (placed.status >= 400) {
    console.error(`demo auto-trade: ${rec.symbol} order refused — ${JSON.stringify(placed.body)}`);
    return null;
  }
  return { symbol: rec.symbol, side: rec.action, qty: rec.qty, notionalUsd: rec.notionalUsd };
}
