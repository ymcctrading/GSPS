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
import { tickerHref } from "@/lib/routes";
import { envCreds, getAsset } from "@/lib/brokers/alpaca";
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
 * Candidate symbols: today's published lists, most recent scan date, both
 * directions interleaved by rank so one side cannot crowd the other out of the
 * scan budget.
 *
 * Only symbols cross this boundary. Scores, levels, verdicts *and the
 * direction* from the stored row are deliberately dropped — every one of them
 * is re-derived by the live scan in `buildRecommendations`. A symbol published
 * as bearish this morning that now arms long is treated as the long it is.
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
    .select("symbol, rank, direction")
    .eq("scan_date", scanDate)
    .order("rank");

  const rows = (data ?? []) as { symbol: string; rank: number; direction: string }[];
  const bullish = rows.filter((r) => r.direction === "bullish");
  const bearish = rows.filter((r) => r.direction === "bearish");

  // Interleaved rather than concatenated: taking the first N of a combined list
  // sorted by rank would spend the whole scan budget on whichever side happened
  // to publish more rows, and the budget is small enough for that to mean the
  // other side never gets looked at.
  const interleaved: string[] = [];
  for (let i = 0; i < Math.max(bullish.length, bearish.length); i++) {
    if (bullish[i]) interleaved.push(bullish[i].symbol.toUpperCase());
    if (bearish[i]) interleaved.push(bearish[i].symbol.toUpperCase());
  }

  return [...new Set(interleaved)].slice(0, MAX_CANDIDATES_SCANNED);
}

/**
 * Whether each symbol can be borrowed to short, asked once per symbol.
 *
 * Only the short candidates are looked up — a long never needs a borrow, and
 * the call costs a broker round trip apiece. Unknown stays unknown rather than
 * becoming `true`: `assessEligibility` refuses a short it cannot confirm, which
 * is the opposite of how `filterShortable` treats the market scan's list, and
 * deliberately so. A scan row a user reads is not an order a user taps.
 */
export async function resolveShortable(symbols: string[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  const creds = envCreds("paper");
  if (!creds || symbols.length === 0) return out;

  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const asset = await getAsset(creds, symbol);
        out.set(symbol.toUpperCase(), Boolean(asset.shortable));
      } catch {
        // Left unset — "not asked", which fails the short rather than passing it.
      }
    }),
  );
  return out;
}

/** One card. Everything on it is derived; nothing is echoed from a stored row. */
export interface Recommendation {
  id: string | null;
  symbol: string;
  assetClass: string;
  action: "buy" | "sell";
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

  // One borrow lookup per short candidate, before the loop, so the broker is
  // asked once per symbol rather than once per eligibility check.
  const shortable = await resolveShortable(
    scans
      .filter((r): r is ScanResult => r !== null && r.direction === "bearish" && !r.error)
      .map((r) => r.symbol),
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

    const verdict = assessEligibility(result, shortable.get(result.symbol.toUpperCase()));
    if (!verdict.eligible) {
      skipped.push({ symbol: result.symbol, reasons: verdict.reasons });
      continue;
    }

    const levels = result.levels!;
    const side = result.direction === "bearish" ? ("sell" as const) : ("buy" as const);
    const sized = sizeGuidedTrade({
      side,
      equity: account.equity,
      buyingPower: account.buyingPower,
      entry: levels.entry,
      stopLoss: levels.stopLoss,
      takeProfit1: levels.takeProfit1,
      masterProfit: levels.masterProfit,
      riskPct: caps.riskPct,
      maxDeployedPct: caps.maxDeployedPct,
      maxTradeNotionalPct: caps.maxTradeNotionalPct,
      deployedUsd: committed,
      assetClass: result.assetClass,
    });

    if (sized.blockedReason) {
      skipped.push({ symbol: result.symbol, reasons: [sized.blockedReason] });
      continue;
    }

    committed += sized.notionalUsd;
    recommendations.push(toRecommendation(result, side, sized, expiresAt));
    if (recommendations.length >= MAX_RECOMMENDATIONS) break;
  }

  return { recommendations, skipped };
}

function toRecommendation(
  result: ScanResult,
  side: "buy" | "sell",
  sized: SizedTrade,
  expiresAt: string,
): Recommendation {
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
    action: side,
    currentPrice: result.currentPrice,
    reason: reasonLine(result),
    qty: sized.qty,
    notionalUsd: sized.notionalUsd,
    riskUsd: sized.riskUsd,
    rewardUsd: sized.rewardUsd,
    riskRewardSentence: riskRewardSentence(sized.riskUsd, sized.rewardUsd),
    exitSentence: exitSentence(plan.scaleOutQty, sized.qty, side),
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
