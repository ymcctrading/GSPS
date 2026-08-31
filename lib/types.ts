/** Shared types for the GSPS scan engine. */

import type { BreakdownKey } from "@/lib/scoring/weights";
import type { DecisionLag } from "@/lib/data/latency";
import type { LiquidityRead } from "@/lib/scan/liquidity";
import type { RegimeRead, SignalVerdict } from "@/lib/signals/types";
import type { GannConfluenceResult, SaraConfluenceResult } from "@/lib/signals/confluence/types";
import type { NoviceEligibility } from "@/lib/universe/types";

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
  /**
   * Nearest Gann fan line values and their angle labels. Support while price
   * sits above the line, resistance while below — see lib/analysis/levelRole.
   * Anchored on daily bars, so these are daily-structure levels: see
   * LEVEL_TIMEFRAME_USAGE["1Day"] for how that's meant to be used.
   */
  fanLines: { angle: string; price: number; distancePct: number; role: "support" | "resistance" }[];
  /** Square of 9 cardinal/ordinal levels near current price. Same role rule as fanLines. */
  squareOf9: { degree: number; price: number; distancePct: number; role: "support" | "resistance" }[];
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
  /**
   * The counter-scenario: what invalidates this thesis and what to watch
   * instead once it does. Optional because fixtures built by hand (tests,
   * mocks) do not need to construct one — `computeTradeLevels` always sets
   * it for a real scan. See lib/constants/gspsTerminology.ts's `pivotPlan`
   * term, which this is the daily-scan counterpart to (the intraday scanner
   * has its own richer version — lib/scanner/intraday.ts's `pivotPlan`).
   */
  pivotPlan?: string;
}

/**
 * The public grouping a scored criterion rolls up into.
 *
 * The individual criteria — what each one tests, and at what threshold — are
 * the scoring model, and the model does not leave the server. The pillar is
 * the coarse, publishable half: it says which part of the analysis earned or
 * lost a point without naming the condition that decided it.
 */
export type ScorePillar = "trend" | "structure" | "setup" | "timing" | "riskReward";

export interface ScoreBreakdownItem {
  /**
   * Stable id for the criterion, independent of its display text. Weights and
   * factor attribution key off this, so rewording a criterion no longer
   * detaches its weight or splits its history in two — see
   * lib/scoring/weights.ts. Absent only on items built outside `computeScore`
   * (test fixtures, and anything constructed before this field existed).
   */
  key?: BreakdownKey;
  criterion: string;
  passed: boolean;
  note: string;
  /**
   * Which pillar this criterion counts towards. Absent on the items that are
   * appended after scoring to explain a capped state — they carry no point, so
   * they belong to no pillar.
   */
  pillar?: ScorePillar;
}

/** One pillar's contribution to the score: points earned out of points available. */
export interface ScorePillarSummary {
  pillar: ScorePillar;
  met: number;
  total: number;
}

/**
 * The client-safe view of a score. Carries enough to show where a score came
 * from — which pillars are strong, which are empty — and nothing that would
 * let a reader reconstruct the criteria behind them.
 */
export interface PublicScoreSummary {
  score: number;
  max: number;
  pillars: ScorePillarSummary[];
  /**
   * Set when the published state sits below what the score alone would give,
   * phrased without reference to the rule that capped it.
   */
  stateNote: string | null;
}

export interface ScanDecision {
  score: number; // 0–9
  outputState: "Execute" | "Watch" | "Reject";
  /**
   * Server-only. `redactDecision` empties this before a decision crosses an
   * API boundary — see lib/scoring/public-summary.ts.
   */
  breakdown: ScoreBreakdownItem[];
  /** The publishable rollup of `breakdown`, attached in place of it. */
  summary?: PublicScoreSummary;
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
  /**
   * How far behind the market the bars this scan was computed on are, expressed
   * against the execution timeframe. Published deliberately: the verdict is
   * held back when the lag is a whole bar or more, and a reader is owed the
   * reason rather than an unexplained Watch. See lib/data/latency.ts.
   */
  dataLag?: DecisionLag;
  /**
   * The last closed candle on the execution timeframe — the bar the setup was
   * actually read off. Carried so a recorded scan can store the OHLCV it was
   * decided on rather than a zero-filled placeholder (lib/learning/record.ts).
   */
  executionBar?: Bar;
  decision: ScanDecision;
  /**
   * Price and average turnover, for the platform-wide liquidity floor — see
   * lib/scan/liquidity.ts. Absent when the scan could not read enough daily
   * history to average, which the floor treats as a failure rather than a pass.
   */
  liquidity?: LiquidityRead;
  /** Optional: option premium supplied by user for the 12–18% stop calc. */
  optionPremium?: number;
  /**
   * The Signal and Regime Engine's read (lib/signals) — a separate decision
   * layer from `decision` above, never merged into it, never combined with
   * each other either: each state gets its own independent verdict, for all
   * four states the engine implements. `trendPullback` is `null` whenever
   * the regime isn't a Trend read. The other three are `null` only when
   * there isn't enough execution-bar history yet. All are absent entirely
   * on an errored scan.
   */
  signals?: {
    regime: RegimeRead;
    trendPullback: SignalVerdict | null;
    trendBreakout: SignalVerdict | null;
    confirmedReversal: SignalVerdict | null;
    rangeReversion: SignalVerdict | null;
    /**
     * Gann Confluence Layer / Sara Confluence Layer — additive,
     * feature-flagged confluence reads, never merged into the four states
     * above and never able to override any of their gates or `tradeable`
     * verdicts. `null` when the module is disabled for this market (see
     * `lib/signals/confluence/flags.ts`) rather than attempted and failed.
     * See docs/GANN_SARA_CONFLUENCE.md.
     */
    gannConfluence: GannConfluenceResult | null;
    saraConfluence: SaraConfluenceResult | null;
  };
  /**
   * `novice_eligible`, per the Market Universe, Data Quality & Account
   * Constraints engine (lib/universe) — whether this symbol belongs in a
   * novice's universe at all, independent of any specific setup on it.
   * Informational, same as `signals` above: it does not gate `decision` or
   * `signals.*` verdicts, and a caller that wants `trade_qualified` composes
   * it from this plus the relevant `signals` verdict via
   * `lib/universe/eligibility.ts`'s `assessTradeQualification`. Absent
   * entirely on an errored scan. See docs/MARKET_UNIVERSE_DATA_QUALITY.md.
   */
  noviceUniverse?: NoviceEligibility;
  error?: string;
  /**
   * Why the scan failed, as a stable discriminator. `rate_limited` in
   * particular is temporary — the UI offers a retry rather than presenting the
   * symbol as unscannable.
   */
  errorCode?: "rate_limited" | "unauthorized" | "not_found" | "upstream" | "unknown";
}
