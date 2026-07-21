/** Shared types for the GSPS scan engine. */

export type AssetClass = "us_equity" | "crypto";

export interface Bar {
  t: string; // ISO timestamp
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type Timeframe = "1Month" | "1Week" | "1Day" | "1Hour" | "15Min" | "5Min" | "1Min";

export type Direction = "bullish" | "bearish" | "none";

/** Sara Sniper Strat bar states. */
export type StratState = "1" | "2U" | "2D" | "3";

export interface StratPattern {
  name: "2-1-2" | "2-2" | "3-1-2" | "PMG";
  direction: Exclude<Direction, "none">;
  /** Price that must be broken by one penny to trigger the trade. */
  triggerPrice: number;
  /** Structural stop: one penny opposite the trigger candle. */
  stopPrice: number;
  description: string;
}

export interface TrendReading {
  timeframe: Timeframe;
  direction: Exclude<Direction, "none"> | "sideways";
  /** Recent swing-derived support/resistance levels. */
  support: number[];
  resistance: number[];
}

export interface GannLevels {
  /** Nearest Gann fan line values and their angle labels. */
  fanLines: { angle: string; price: number; distancePct: number }[];
  /** Square of 9 cardinal/ordinal levels near current price. */
  squareOf9: { degree: number; price: number; distancePct: number }[];
  /** Whether today falls in a Gann time-cycle window. */
  timeCycleActive: boolean;
  timeCycleDates: string[];
}

export interface TradeLevels {
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  masterProfit: number;
  riskPerShare: number;
  rewardToRiskTp1: number;
  rewardToRiskMaster: number;
  /** Warning when the structural stop is outside the recommended 12–18% band. */
  stopPctOfPrice: number;
  stopBandWarning: string | null;
}

export interface ScoreBreakdownItem {
  criterion: string;
  passed: boolean;
  note: string;
}

export interface ScanDecision {
  score: number; // 0–9
  outputState: "Execute" | "Watch" | "Reject";
  breakdown: ScoreBreakdownItem[];
}

export interface ScanResult {
  symbol: string;
  assetClass: AssetClass;
  scannedAt: string;
  currentPrice: number;
  direction: Direction;
  trends: TrendReading[];
  gann: GannLevels;
  pattern: StratPattern | null;
  levels: TradeLevels | null;
  decision: ScanDecision;
  /** Optional: option premium supplied by user for the 12–18% stop calc. */
  optionPremium?: number;
  error?: string;
}
