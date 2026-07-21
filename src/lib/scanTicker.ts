/**
 * scanTicker — the module the API routes import (`@/lib/scanTicker`).
 *
 * Runs one symbol through the full waterfall and returns a ScanResult whose
 * `decision.outputState` is one of Execute / Watch / Reject (the shape the
 * existing /api/scan and /api/batch-scan routes already expect).
 *
 * Waterfall (Doc 4 §2):
 *   Strat Sniper Gate fails            -> Reject
 *   passes gate, score 8..9 (Pristine) -> Execute  (Tier 1)
 *   passes gate, score 7 + velocity    -> Watch    (Tier 2 fallback)
 *   otherwise                          -> Reject
 */
import { getMarketDataProvider } from "@/lib/marketData";
import type { Interval } from "@/lib/marketData/types";
import { computeIndicators } from "@/lib/scanner/indicators";
import {
  evaluateChecklist,
  hasVelocity,
  inferBias,
  scoreOf,
  stratSniperGate,
} from "@/lib/scanner/checklist";
import type { ScanDecision, ScanResult, ScanTier } from "@/lib/scanner/types";

/** Lookback window (days) used to compute the daily-bar indicators. */
const DAILY_LOOKBACK_DAYS = 120;

export async function scanTicker(
  ticker: string,
  optionPremium?: number
): Promise<ScanResult> {
  const symbol = ticker.toUpperCase();
  const provider = getMarketDataProvider();

  // Snap the window to a day boundary: the post-close scan evaluates COMPLETED
  // sessions, so the result is stable within a day (and reproducible in tests)
  // rather than drifting on every millisecond of wall-clock time.
  const DAY = 24 * 60 * 60 * 1000;
  const to = Math.floor(Date.now() / DAY) * DAY;
  const from = to - DAILY_LOOKBACK_DAYS * DAY;
  const interval: Interval = "1d";
  const bars = await provider.getCandles({ symbol, interval, from, to });

  const scannedAt = new Date().toISOString();

  // Not enough history to evaluate — reject cleanly rather than throw.
  if (bars.length < 20) {
    return {
      symbol,
      assetClass: (bars[0]?.session ? "STOCK" : "STOCK") as ScanResult["assetClass"],
      price: bars[bars.length - 1]?.close ?? 0,
      indicators: computeIndicators(bars),
      checklist: [],
      decision: {
        outputState: "Reject",
        tier: "REJECTED",
        score: 0,
        bias: "NEUTRAL",
        stratGatePassed: false,
        reason: "Insufficient history to evaluate.",
      },
      optionPremium,
      scannedAt,
    };
  }

  const quote = await provider.getQuote(symbol);
  const indicators = computeIndicators(bars);
  const bias = inferBias(indicators);
  const gatePassed = stratSniperGate(bars, indicators);
  const checklist = evaluateChecklist(bars, indicators, bias);
  const score = scoreOf(checklist);

  const decision = decide(gatePassed, score, indicators, bias);

  const result: ScanResult = {
    symbol,
    assetClass: quote.assetClass,
    price: quote.last,
    indicators,
    checklist,
    decision,
    optionPremium,
    scannedAt,
  };

  // Tactical layer (Investor Mode) only for actionable setups.
  if (decision.outputState !== "Reject") {
    result.tactical = tacticalLevels(quote.last, indicators, bias);
  }

  return result;
}

function decide(
  gatePassed: boolean,
  score: number,
  indicators: ReturnType<typeof computeIndicators>,
  bias: ScanResult["decision"]["bias"]
): ScanDecision {
  if (!gatePassed) {
    return {
      outputState: "Reject",
      tier: "REJECTED",
      score,
      bias,
      stratGatePassed: false,
      reason: "Failed Strat Sniper Gate (no structural trend agreement).",
    };
  }
  let tier: ScanTier = "REJECTED";
  let outputState: ScanDecision["outputState"] = "Reject";
  let reason = "";

  if (score >= 8) {
    tier = "TIER_1_PRISTINE";
    outputState = "Execute";
    reason = `Pristine setup: ${score}/9 checklist.`;
  } else if (score === 7 && hasVelocity(indicators)) {
    tier = "TIER_2_VELOCITY";
    outputState = "Watch";
    reason = `Velocity fallback: 7/9 with RVOL ${indicators.rvol} / ATR ${indicators.atrPct}%.`;
  } else {
    reason = `Score ${score}/9 below actionable threshold.`;
  }

  return { outputState, tier, score, bias, stratGatePassed: true, reason };
}

function tacticalLevels(
  price: number,
  indicators: ReturnType<typeof computeIndicators>,
  bias: ScanResult["decision"]["bias"]
): NonNullable<ScanResult["tactical"]> {
  const atr = indicators.atr14 || price * 0.01;
  const dir = bias === "BEARISH" ? -1 : 1;
  const targetEntry = +price.toFixed(2);
  const stop = +(price - dir * 1.5 * atr).toFixed(2);
  const takeProfit = [1, 2, 3].map((m) => +(price + dir * m * atr).toFixed(2));
  return { targetEntry, stop, takeProfit };
}

export default scanTicker;
