/**
 * Guided Decision Mode — assembling the recommendations.
 *
 * The shape of a request:
 *
 *   1. Is Guided Mode allowed to run at all (paper-only, kill switch, caps)?
 *   2. Which symbols are worth *looking* at? The published daily lists are the
 *      candidate source and nothing more.
 *   3. Re-scan each candidate live, right now.  The dashboard's stored rows can
 *      be hours old and were priced against bars from a different session; a
 *      one-tap Buy button on a stale plan is the exact failure this mode has to
 *      not have. Nothing from `daily_scans` reaches the card — only the symbol.
 *   4. Filter on eligibility, size against the user's own equity, and log every
 *      recommendation that gets rendered.
 *
 * Step 3 is the expensive one and it is not negotiable. `MAX_CANDIDATES_SCANNED`
 * is what keeps it inside a serverless budget.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScanResult } from "@/lib/types";
import { scanTicker } from "@/lib/scanTicker";
import { assetClassOf, getOrCreateAccount, listOpenPositions, quotePrice } from "@/lib/brokers/simulator";
import { parseOccSymbol } from "@/lib/portfolio/occ";
import { assessEligibility } from "@/lib/guided/eligibility";
import { sizeGuidedTrade, type SizedTrade } from "@/lib/guided/sizing";
import { exitSentence, reasonLine, riskRewardSentence, trendSummary } from "@/lib/guided/copy";
import { planProtocolExit } from "@/lib/trade/protocol-exit";
import { toPublicScoreSummary } from "@/lib/scoring/public-summary";
import { tickerHref } from "@/lib/utils";
import {
  MAX_CANDIDATES_SCANNED,
  MAX_RECOMMENDATIONS,
  RECOMMENDATION_TTL_MINUTES,
  type GuidedCaps,
} from "@/lib/guided/config";
import type { PublicScoreSummary } from "@/lib/types";

export interface GuidedAccount {
  equity: number;
  buyingPower: number;
  /** Open paper positions by symbol, for the deployed-capital cap. */
  openSymbols: Map<string, { qty: number; avgEntry: number }>;
}

/**
 * Equity, cash and open positions, marked to live prices. Guided Mode sizes
 * against equity, so this cannot be the cash balance alone: a user fully
 * invested in one position would otherwise be told their risk budget is zero.
 */
export async function readGuidedAccount(
  supabase: SupabaseClient,
  userId: string,
): Promise<GuidedAccount> {
  const [account, positions] = await Promise.all([
    getOrCreateAccount(supabase, userId),
    listOpenPositions(supabase, userId),
  ]);

  const marks = await Promise.all(
    positions.map(async (p) => {
      // An option leg has no live per-contract quote here; its entry price is
      // the honest stand-in, and it is never a guided position anyway.
      if (parseOccSymbol(p.symbol)) return p.avg_entry_price;
      return (await quotePrice(p.symbol, assetClassOf(p.symbol))) ?? p.avg_entry_price;
    }),
  );

  const marketValue = positions.reduce((sum, p, i) => sum + marks[i] * p.qty, 0);
  const openSymbols = new Map(
    positions.map((p) => [p.symbol.toUpperCase(), { qty: p.qty, avgEntry: p.avg_entry_price }]),
  );

  return {
    equity: account.cash + marketValue,
    // No margin is modelled — a simulated cash account can only buy what it holds.
    buyingPower: account.cash,
    openSymbols,
  };
}

/**
 * True when the account has a live brokerage linked.
 *
 * Guided Mode hard-blocks in that case: recommending a trade and sizing it for
 * someone is a different act when the money is real, and lifting the block is a
 * product and legal decision for the account owner to make deliberately, not a
 * default to grow into. A linked *paper* Alpaca connection is not a live
 * brokerage and does not block anything.
 */
export async function hasLiveBrokerage(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("broker_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("provider", ["alpaca_live", "snaptrade"])
    .limit(1);
  return (data ?? []).length > 0;
}

/**
 * Candidate symbols: today's published bullish list, most recent scan date.
 *
 * Only symbols cross this boundary. Scores, levels and verdicts from the stored
 * row are deliberately dropped — every one of them is re-derived by the live
 * scan in `buildRecommendations`.
 */
export async function candidateSymbols(supabase: SupabaseClient): Promise<string[]> {
  const { data: latest } = await supabase
    .from("daily_scans")
    .select("scan_date")
    .order("scan_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const scanDate = (latest as { scan_date?: string } | null)?.scan_date;
  if (!scanDate) return [];

  const { data } = await supabase
    .from("daily_scans")
    .select("symbol, rank")
    .eq("scan_date", scanDate)
    // Long only at launch — see lib/guided/eligibility.ts.
    .eq("direction", "bullish")
    .order("rank")
    .limit(MAX_CANDIDATES_SCANNED);

  return [...new Set(((data ?? []) as { symbol: string }[]).map((r) => r.symbol.toUpperCase()))];
}

/** One card. Everything on it is derived; nothing is echoed from a stored row. */
export interface Recommendation {
  id: string | null;
  symbol: string;
  assetClass: string;
  action: "buy";
  currentPrice: number;
  reason: string;
  qty: number;
  notionalUsd: number;
  riskUsd: number;
  rewardUsd: number;
  riskRewardSentence: string;
  exitSentence: string;
  expiresAt: string;
  /** The plan behind the numbers, for the expandable "why". */
  why: {
    score: PublicScoreSummary;
    verdict: string;
    entry: number;
    stopLoss: number;
    takeProfit1: number;
    masterProfit: number;
    trend: string;
    patternName: string | null;
    tickerHref: string;
  };
}

/** A candidate that was scanned and rejected — logged, never rendered. */
export interface SkippedCandidate {
  symbol: string;
  reasons: string[];
}

export interface BuiltRecommendations {
  recommendations: Recommendation[];
  skipped: SkippedCandidate[];
}

export async function buildRecommendations(params: {
  symbols: string[];
  account: GuidedAccount;
  caps: GuidedCaps;
  deployedUsd: number;
  now?: Date;
}): Promise<BuiltRecommendations> {
  const { symbols, account, caps, deployedUsd, now = new Date() } = params;

  const scans = await Promise.all(
    symbols.slice(0, MAX_CANDIDATES_SCANNED).map((s) => scanTicker(s).catch((): ScanResult | null => null)),
  );

  const recommendations: Recommendation[] = [];
  const skipped: SkippedCandidate[] = [];
  const expiresAt = new Date(now.getTime() + RECOMMENDATION_TTL_MINUTES * 60_000).toISOString();

  // Deployed capital rises as this loop commits size, so each card is sized
  // against what the *previous* cards on the same screen would already use.
  // Sizing every card against the same starting figure would let three cards
  // that are each inside the portfolio cap breach it together.
  let committed = deployedUsd;

  for (let i = 0; i < scans.length; i++) {
    const result = scans[i];
    if (!result) {
      skipped.push({ symbol: symbols[i], reasons: ["The scan could not be completed."] });
      continue;
    }

    const verdict = assessEligibility(result);
    if (!verdict.eligible) {
      skipped.push({ symbol: result.symbol, reasons: verdict.reasons });
      continue;
    }

    const levels = result.levels!;
    const sized = sizeGuidedTrade({
      equity: account.equity,
      buyingPower: account.buyingPower,
      entry: levels.entry,
      stopLoss: levels.stopLoss,
      takeProfit1: levels.takeProfit1,
      masterProfit: levels.masterProfit,
      riskPct: caps.riskPct,
      maxDeployedPct: caps.maxDeployedPct,
      deployedUsd: committed,
    });

    if (sized.blockedReason) {
      skipped.push({ symbol: result.symbol, reasons: [sized.blockedReason] });
      continue;
    }

    committed += sized.notionalUsd;
    recommendations.push(toRecommendation(result, sized, expiresAt));
    if (recommendations.length >= MAX_RECOMMENDATIONS) break;
  }

  return { recommendations, skipped };
}

function toRecommendation(result: ScanResult, sized: SizedTrade, expiresAt: string): Recommendation {
  const levels = result.levels!;
  const plan = planProtocolExit(sized.qty, {
    stopLoss: levels.stopLoss,
    takeProfit1: levels.takeProfit1,
    masterProfit: levels.masterProfit,
  });

  return {
    id: null, // filled in once the row is logged
    symbol: result.symbol,
    assetClass: result.assetClass,
    action: "buy",
    currentPrice: result.currentPrice,
    reason: reasonLine(result),
    qty: sized.qty,
    notionalUsd: sized.notionalUsd,
    riskUsd: sized.riskUsd,
    rewardUsd: sized.rewardUsd,
    riskRewardSentence: riskRewardSentence(sized.riskUsd, sized.rewardUsd),
    exitSentence: exitSentence(plan.scaleOutQty, sized.qty),
    expiresAt,
    why: {
      // The rollup, not the breakdown: the scoring criteria do not cross an API
      // boundary here any more than they do anywhere else.
      score: result.decision.summary ?? toPublicScoreSummary(result.decision),
      verdict: result.decision.outputState,
      entry: levels.entry,
      stopLoss: levels.stopLoss,
      takeProfit1: levels.takeProfit1,
      masterProfit: levels.masterProfit,
      trend: trendSummary(result.trends),
      patternName: result.pattern?.name ?? null,
      tickerHref: tickerHref(result.symbol),
    },
  };
}
