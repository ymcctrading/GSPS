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

/**
 * Chart/scan timeframes. The name is the length of one candle — a "5Min" bar
 * covers exactly five minutes. See `lib/timeframe.ts` for intervals, labels and
 * lookback windows.
 */
export type Timeframe =
  | "1Year"
  | "1Month"
  | "1Week"
  | "1Day"
  | "4Hour"
  | "2Hour"
  | "1Hour"
  | "15Min"
  | "5Min"
  | "1Min";

export type Direction = "bullish" | "bearish" | "none";

/** Reversal pattern bar states. */
export type StratState = "1" | "2U" | "2D" | "3";

export interface StratPattern {
  name: "2-1-2" | "2-2" | "1-2-2" | "3-2-2" | "3-1-2" | "PMG";
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
  takeProfit2: number; // Runner target, scaled per asset class
  masterProfit: number; // Alias for takeProfit2 (for backward compatibility)
  riskPerShare: number;
  rewardToRiskTp1: number;
  rewardToRiskTp2: number;
  rewardToRiskMaster: number; // Alias for rewardToRiskTp2 (for backward compatibility)
  /**
   * True when the master target snapped to a support or harmonic level in range
   * rather than falling back to the asset class's default runner multiple — i.e.
   * a structural level confirms the target; it was not merely projected from
   * risk.
   *
   * Recorded as a flag rather than inferred by comparing `masterProfit` against
   * that default, because the comparison is float arithmetic on bar prices and
   * would flip on rounding noise. This reports which branch actually ran.
   */
  masterFromStructure: boolean;
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

/**
 * What the setup is betting on. A reversion trades against an extended move
 * into a level; a continuation trades with a trend that is still expanding.
 * The two read the same macro evidence in opposite directions, so the score
 * and the published lists both have to know which one is being judged.
 */
export type SetupKind = "reversion" | "continuation";

export interface ScanResult {
  symbol: string;
  assetClass: AssetClass;
  scannedAt: string;
  currentPrice: number;
  direction: Direction;
  setupKind: SetupKind;
  /** Recent range expansion against the trailing baseline — the momentum read. */
  momentumElevated: boolean;
  trends: TrendReading[];
  gann: GannLevels;
  pattern: StratPattern | null;
  /** Every setup armed on the execution timeframe (the primary is `pattern`). */
  armedPatterns: StratPattern[];
  levels: TradeLevels | null;
  /**
   * Why the trade plan is missing while the rest of the scan is intact. Unlike
   * `error` (which means the whole scan failed), this leaves the scan usable.
   */
  levelsError?: string;
  decision: ScanDecision;
  /** Optional: option premium supplied by user for the 12–18% stop calc. */
  optionPremium?: number;
  error?: string;
  /**
   * Why the scan failed, as a stable discriminator. `rate_limited` in
   * particular is temporary — the UI offers a retry rather than presenting the
   * symbol as unscannable.
   */
  errorCode?: "rate_limited" | "unauthorized" | "not_found" | "upstream" | "unknown";
}
