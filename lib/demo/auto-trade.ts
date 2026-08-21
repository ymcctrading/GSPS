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
 * Two things ARE specific to this account, both deliberately, on request:
 *
 *   - Its equity compounds. `readGuidedAccount` already sizes every trade
 *     against current equity (cash + marked positions), not a fixed
 *     starting balance — so a profitable stretch enlarges the risk budget
 *     on its own, and a loss shrinks it. Nothing extra is needed for that;
 *     it falls out of code that already existed for real users.
 *   - It runs one of two strategy "arms" each trading day, deterministically
 *     picked from the date (no extra state to store or drift out of sync):
 *     `cadence` days allow a couple more trades than the normal daily cap,
 *     `size` days lean harder into each trade taken, especially a symbol
 *     with a real winning track record on this account. This is a running
 *     A/B comparison, not a permanent policy — see `pickArm`.
 *
 * On a day nothing new clears the Execute bar, it looks for a reason to add
 * to a position already open rather than forcing a new one — see
 * `runQuietDayDca`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { etDateKey } from "@/lib/market/session";
import { assetClassOf, listOpenPositions, quotePrice } from "@/lib/brokers/simulator";
import { parseOccSymbol } from "@/lib/portfolio/occ";
import { killSwitchRefusal } from "@/lib/trade/kill-switch";
import { placeSimulatedOrder } from "@/lib/trade/place-order";
import {
  buildRecommendations,
  candidateSymbols,
  hasLiveBrokerage,
  readGuidedAccount,
  type Recommendation,
} from "@/lib/guided/service";
import { readCapUsage } from "@/lib/guided/caps";
import { MAX_RISK_PCT, MAX_GUIDED_BUDGET_USD, resolveGuidedCaps, type GuidedCaps } from "@/lib/guided/config";

/** A symbol needs at least this many closed trades before it's trusted as a "favorite". */
const MIN_TRACK_RECORD_SAMPLE = 2;
/** ...and has to have won at least this often, ... */
const FAVORITE_WIN_RATE = 0.6;
/** ...and been net profitable, to be leaned into rather than treated as one of many candidates. */
const MIN_FAVORITE_NET_USD = 0;

/** How many extra trades a "cadence" day's daily cap allows over the configured default. */
const CADENCE_ARM_EXTRA_TRADES = 2;
/** How much harder a "size" day leans into risk/budget, bounded by Guided Mode's own hard ceilings. */
const SIZE_ARM_MULTIPLIER = 1.5;

/** At most this many existing positions get a DCA add in one run, so a quiet day adds a little, not a lot. */
const MAX_DCA_ADDS_PER_RUN = 2;
/** A DCA add spends about half a normal per-trade budget — sized to add on, not to open a second full position. */
const DCA_BUDGET_FRACTION = 0.5;

export type DemoTradeArm = "cadence" | "size";

export interface DemoAutoTradeResult {
  ran: boolean;
  reason?: string;
  demoUserId?: string;
  arm?: DemoTradeArm;
  favoriteSymbol?: string | null;
  placed: { symbol: string; side: "buy" | "sell"; qty: number; notionalUsd: number }[];
  dcaAdds: { symbol: string; qty: number; notionalUsd: number }[];
  skipped: { symbol: string; reasons: string[] }[];
  blockedReason: string | null;
}

/**
 * Which of the two A/B arms today is. Pure function of the ET trading date —
 * deterministic and needs no storage, so it can't drift out of sync with
 * itself across runs or environments. Not meant to be a permanent split:
 * it's here so the two strategies can eventually be compared on this
 * account's own real trade history (`trade_logs`, filterable by date).
 */
export function pickArm(dateKey: string): DemoTradeArm {
  const day = Number(dateKey.slice(-2));
  return Number.isFinite(day) && day % 2 === 0 ? "cadence" : "size";
}

function armAdjustedCaps(caps: GuidedCaps, arm: DemoTradeArm): GuidedCaps {
  if (arm === "cadence") {
    return { ...caps, maxTradesPerDay: Math.min(caps.maxTradesPerDay + CADENCE_ARM_EXTRA_TRADES, 20) };
  }
  return {
    ...caps,
    riskPct: Math.min(caps.riskPct * SIZE_ARM_MULTIPLIER, MAX_RISK_PCT),
    budgetUsd: caps.budgetUsd == null ? null : Math.min(caps.budgetUsd * SIZE_ARM_MULTIPLIER, MAX_GUIDED_BUDGET_USD),
  };
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
 * A symbol this account has genuinely done well on, or null if nothing
 * qualifies yet. Read from `trade_logs` — closed trades only, since an open
 * position has no outcome to judge it by. Requires a real sample and a real
 * win rate rather than one lucky trade, and a net-positive dollar total so a
 * high win rate on trades that lost more than they made doesn't count.
 */
async function computeFavoriteSymbol(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("trade_logs")
    .select("symbol, outcome, profit_loss_dollars")
    .eq("user_id", userId)
    .neq("outcome", "pending");

  const rows = (data ?? []) as { symbol: string; outcome: string | null; profit_loss_dollars: number | null }[];
  const bySymbol = new Map<string, { count: number; wins: number; net: number }>();
  for (const row of rows) {
    const key = row.symbol.toUpperCase();
    const agg = bySymbol.get(key) ?? { count: 0, wins: 0, net: 0 };
    agg.count += 1;
    if (row.outcome === "profit") agg.wins += 1;
    agg.net += Number(row.profit_loss_dollars ?? 0);
    bySymbol.set(key, agg);
  }

  let best: { symbol: string; net: number } | null = null;
  for (const [symbol, agg] of bySymbol) {
    if (agg.count < MIN_TRACK_RECORD_SAMPLE) continue;
    if (agg.wins / agg.count < FAVORITE_WIN_RATE) continue;
    if (agg.net <= MIN_FAVORITE_NET_USD) continue;
    if (!best || agg.net > best.net) best = { symbol, net: agg.net };
  }
  return best?.symbol ?? null;
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

/** Move a symbol to the front of the list, if it's in it. Order otherwise unchanged. */
function favoriteFirst(symbols: string[], favorite: string | null): string[] {
  if (!favorite) return symbols;
  const key = favorite.toUpperCase();
  if (!symbols.includes(key)) return symbols;
  return [key, ...symbols.filter((s) => s !== key)];
}

/**
 * Runs one pass of automated trading for the demo account: new entries when
 * the daily/weekly/deployed caps allow one, otherwise a quiet-day add to an
 * existing position where that's still sound. Meant to be called from a
 * scheduled, bearer-secret-protected route (see app/api/demo/auto-trade) —
 * there is no per-request session here, `supabase` must be a service-role
 * client so RLS doesn't block reading/writing an account that isn't the
 * caller's own.
 */
export async function runDemoAutoTrade(supabase: SupabaseClient, now: Date = new Date()): Promise<DemoAutoTradeResult> {
  const empty: Omit<DemoAutoTradeResult, "ran" | "reason"> = {
    placed: [],
    dcaAdds: [],
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
  const baseCaps = resolveGuidedCaps((settingsRow as { prefs?: unknown } | null)?.prefs ?? null);

  const dateKey = etDateKey(now);
  const arm = pickArm(dateKey);
  const caps = armAdjustedCaps(baseCaps, arm);

  const account = await readGuidedAccount(supabase, demoUserId);
  const usage = await readCapUsage(supabase, demoUserId, caps, account.equity, account.openSymbols, now);
  const favoriteSymbol = await computeFavoriteSymbol(supabase, demoUserId);

  if (usage.blockedReason) {
    const dca = await runQuietDayDca(supabase, demoUserId, account.equity, usage.deployedUsd, caps);
    return {
      ran: true,
      demoUserId,
      arm,
      favoriteSymbol,
      blockedReason: usage.blockedReason,
      placed: [],
      dcaAdds: dca,
      skipped: [],
    };
  }

  // Both scanner sources feed the same candidate list — the daily scanner's
  // published shortlist and whatever the intraday scanner has flagged
  // recently. Neither list is trusted as-is: buildRecommendations re-scans
  // every symbol live and only Execute-rated setups ever become a trade.
  const [dailyCandidates, intradayCandidates] = await Promise.all([
    candidateSymbols(supabase),
    intradayCandidateSymbols(supabase, now),
  ]);
  const rawCandidates = favoriteFirst([...new Set([...dailyCandidates, ...intradayCandidates])], favoriteSymbol);
  if (rawCandidates.length === 0) {
    const dca = await runQuietDayDca(supabase, demoUserId, account.equity, usage.deployedUsd, caps);
    return {
      ran: true,
      demoUserId,
      arm,
      favoriteSymbol,
      blockedReason: null,
      placed: [],
      dcaAdds: dca,
      skipped: [],
    };
  }

  const built = await buildRecommendations({
    symbols: rawCandidates,
    account,
    caps,
    deployedUsd: usage.deployedUsd,
    now,
  });

  // The daily cap is enforced here, not inside buildRecommendations (which
  // caps a single call at MAX_RECOMMENDATIONS regardless of the day's
  // running total) — room is whatever's left of today's arm-adjusted cap.
  const room = Math.max(0, caps.maxTradesPerDay - usage.tradesToday);
  const toPlace = built.recommendations.slice(0, room);

  const placed: DemoAutoTradeResult["placed"] = [];
  for (const rec of toPlace) {
    const result = await placeRecommendation(supabase, demoUserId, rec);
    if (result) placed.push(result);
  }

  // Room left after placing the day's new entries — a favorite-symbol day
  // that only found one qualifying setup still has a quiet-day DCA pass
  // worth trying for everything else already held.
  const dca =
    placed.length === 0
      ? await runQuietDayDca(supabase, demoUserId, account.equity, usage.deployedUsd, caps)
      : [];

  return {
    ran: true,
    demoUserId,
    arm,
    favoriteSymbol,
    blockedReason: null,
    placed,
    dcaAdds: dca,
    skipped: built.skipped,
  };
}

async function placeRecommendation(
  supabase: SupabaseClient,
  userId: string,
  rec: Recommendation,
): Promise<DemoAutoTradeResult["placed"][number] | null> {
  const placed = await placeSimulatedOrder(supabase, userId, {
    symbol: rec.symbol,
    assetClass: "equity",
    side: rec.action,
    qty: rec.qty,
    entryMode: "advised",
    limitPrice: rec.why.entry,
    referencePrice: rec.currentPrice,
    attachLevels: {
      stopLoss: rec.why.stopLoss,
      takeProfit: rec.why.takeProfit1,
      masterProfit: rec.why.masterProfit,
    },
    mode: "paper",
  });
  if (placed.status >= 400) {
    console.error(`demo auto-trade: ${rec.symbol} order refused — ${JSON.stringify(placed.body)}`);
    return null;
  }
  return { symbol: rec.symbol, side: rec.action, qty: rec.qty, notionalUsd: rec.notionalUsd };
}

/**
 * Adds to a handful of already-open long equity positions when the day
 * produced no new Execute-rated setup. "Logical" is deliberately narrow: the
 * position's own stop hasn't been touched and its master target hasn't
 * already been reached — i.e. the trade is still exactly where the protocol
 * expects it to be, just without a fresh signal today. A short is never
 * added to here (averaging up into a losing short is a different, riskier
 * bet than this heuristic is meant to make), and neither is an option leg
 * (no live per-contract quote to size against).
 */
async function runQuietDayDca(
  supabase: SupabaseClient,
  userId: string,
  equity: number,
  startingDeployedUsd: number,
  caps: GuidedCaps,
): Promise<DemoAutoTradeResult["dcaAdds"]> {
  const positions = await listOpenPositions(supabase, userId);
  if (positions.length === 0 || equity <= 0) return [];

  const adds: DemoAutoTradeResult["dcaAdds"] = [];
  let deployedUsd = startingDeployedUsd;

  for (const position of positions) {
    if (adds.length >= MAX_DCA_ADDS_PER_RUN) break;
    if ((deployedUsd / equity) * 100 >= caps.maxDeployedPct) break;
    if (position.side !== "long") continue;
    if (parseOccSymbol(position.symbol)) continue;

    const price = await quotePrice(position.symbol, assetClassOf(position.symbol));
    if (price == null) continue;
    if (position.stop_loss != null && price <= position.stop_loss) continue;
    if (position.master_profit != null && price >= position.master_profit) continue;

    // A budget-off account (caps.budgetUsd === null) still needs a sane
    // dollar floor to size a DCA add against — half the equity risk cap in
    // dollar terms stands in for it.
    const perTradeBudget = caps.budgetUsd ?? (caps.riskPct / 100) * equity;
    const addBudget = perTradeBudget * DCA_BUDGET_FRACTION;
    const qty = Math.floor(addBudget / price);
    if (qty < 1) continue;

    const placed = await placeSimulatedOrder(supabase, userId, {
      symbol: position.symbol,
      assetClass: "equity",
      side: "buy",
      qty,
      entryMode: "now",
      mode: "paper",
    });
    if (placed.status >= 400) {
      console.error(`demo auto-trade: DCA add for ${position.symbol} refused — ${JSON.stringify(placed.body)}`);
      continue;
    }

    const notionalUsd = qty * price;
    adds.push({ symbol: position.symbol, qty, notionalUsd });
    deployedUsd += notionalUsd;
  }

  return adds;
}
