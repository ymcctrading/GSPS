import type { AssetClass } from "@/lib/marketData/types";

/** Directional bias of a mean-reversion setup. */
export type Bias = "BULLISH" | "BEARISH" | "NEUTRAL";

/** Terminal decision consumed by the API routes. */
export type OutputState = "Execute" | "Watch" | "Reject";

/** Which gate/tier produced the decision (for transparency / audit — S-10). */
export type ScanTier = "TIER_1_PRISTINE" | "TIER_2_VELOCITY" | "REJECTED";

export interface Indicators {
  sma20: number;
  atr14: number;
  /** ATR as a % of price — used for "ATR expansion" velocity check. */
  atrPct: number;
  rvol: number; // relative volume vs. average
  rsi14: number;
  /** z-score of last close vs. the SMA20 band (mean-reversion distance). */
  zScore: number;
}

export interface ChecklistItem {
  key: string;
  passed: boolean;
  detail: string;
}

export interface ScanDecision {
  outputState: OutputState;
  tier: ScanTier;
  /** 0–9 proprietary checklist score. */
  score: number;
  bias: Bias;
  /** True only if the Strat Sniper Gate passed. */
  stratGatePassed: boolean;
  reason: string;
}

export interface ScanResult {
  symbol: string;
  assetClass: AssetClass;
  price: number;
  indicators: Indicators;
  checklist: ChecklistItem[];
  decision: ScanDecision;
  /** Present for Execute/Watch: suggested tactical levels (Investor Mode layer). */
  tactical?: {
    targetEntry: number;
    stop: number;
    takeProfit: number[];
  };
  optionPremium?: number;
  scannedAt: string;
}
