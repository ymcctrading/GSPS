/**
 * Shared types for the GSPS Signal and Regime Engine — a new, separate
 * decision layer from the Gann/STRAT scan engine in `lib/strat` and
 * `lib/scoring`. Per the spec ("GSPS Signal and Regime Engine", Aug 28
 * 2026): four distinct scanner states, never combined into a single
 * buy/sell indicator, each with its own regime definition, entry/stop/
 * target logic, disqualifiers and expiry.
 *
 * Draft implementation directives — requires securities/compliance counsel
 * review before use in live personalized recommendations or execution.
 */

import type { Direction } from "@/lib/types";

export type Regime = "trend" | "range" | "transition" | "event";

export interface RegimeRead {
  regime: Regime;
  /** "sideways" only ever applies to range/event reads. */
  direction: Exclude<Direction, "none"> | "sideways";
  /** Which required characteristics were matched, for explainability. */
  reasons: string[];
  /** Which disqualifying conditions were matched (regime is still reported). */
  disqualifiers: string[];
}

export type ScannerStateName =
  | "trendPullback"
  | "trendBreakout"
  | "confirmedReversal"
  | "rangeReversion";

export type NoviceAvailability = "primary" | "secondary" | "highThreshold";

export interface ScannerStateMeta {
  name: ScannerStateName;
  label: string;
  purpose: string;
  noviceAvailability: NoviceAvailability;
  /**
   * Documentation only — no evaluator gates on this field. Each state does
   * its own price-action-based read of whether the setup's precondition
   * (a trend, a base, exhaustion, a range) actually holds, rather than
   * delegating to the regime classifier's coarser four-way label.
   */
  requiredRegime: Regime;
}

export const SCANNER_STATE_META: Record<ScannerStateName, ScannerStateMeta> = {
  trendPullback: {
    name: "trendPullback",
    label: "Trend Pullback",
    purpose: "Enter a controlled retracement that resumes in a confirmed trend.",
    noviceAvailability: "primary",
    requiredRegime: "trend",
  },
  trendBreakout: {
    name: "trendBreakout",
    label: "Trend Breakout",
    purpose: "Enter accepted expansion from a validated base/compression.",
    noviceAvailability: "secondary",
    requiredRegime: "range",
  },
  confirmedReversal: {
    name: "confirmedReversal",
    label: "Confirmed Reversal",
    purpose: "Enter only after exhaustion at a meaningful location becomes a structural shift.",
    noviceAvailability: "highThreshold",
    requiredRegime: "transition",
  },
  rangeReversion: {
    name: "rangeReversion",
    label: "Range Reversion",
    purpose: "Buy support / sell resistance in verified rotational conditions.",
    noviceAvailability: "secondary",
    requiredRegime: "range",
  },
};

/** Rules Alignment Score bands — never rendered as a probability of profit. */
export type RulesAlignmentTier = "watchlistOnly" | "qualified" | "aTier" | "aPlusTier";

/**
 * The "GSPS Implementation Blueprint" (2026-09-08) §14.2's five-band
 * classification of a 0–100 score: `0–24 NO_TRADE, 25–49 WATCH, 50–69
 * DEVELOPING, 70–84 ACTIONABLE, 85–100 HIGH_CONFLUENCE`. GSPS has no single
 * composite score matching §14.1's exact component list (trend/gann-
 * coordinate/digital-root-vortex/sara-trigger/etc. combined) — this is the
 * blueprint's literal band cut points applied to the existing Rules
 * Alignment Score (`RulesAlignmentScore.score`, 0–100, per the "GSPS Signal
 * and Regime Engine" spec), the closest existing GSPS number on the same
 * scale. Additive/informational only: `tier`/`tierQualifies` — not this
 * band — remain the actual qualification gate, since the blueprint's own
 * §14.2 text calls its thresholds "placeholders" that "must be calibrated
 * through research," not a ready replacement for an already-calibrated gate.
 */
export type BlueprintScoreBand = "NO_TRADE" | "WATCH" | "DEVELOPING" | "ACTIONABLE" | "HIGH_CONFLUENCE";

export interface RulesAlignmentBreakdownItem {
  key: string;
  label: string;
  points: number;
  maxPoints: number;
  /** False when the component has no reliable data and is excluded from scoring rather than failed. */
  applicable: boolean;
  passed: boolean;
  note: string;
}

export interface RulesAlignmentScore {
  /** 0–100, rescaled for any inapplicable (data-unavailable) components. */
  score: number;
  tier: RulesAlignmentTier;
  /** See `BlueprintScoreBand` — informational relabeling of `score`, never a gate. */
  blueprintScoreBand: BlueprintScoreBand;
  breakdown: RulesAlignmentBreakdownItem[];
}

export interface SignalDisqualifier {
  key: string;
  reason: string;
}

/**
 * Account/context gates a caller supplies from outside this module — event
 * calendars, liquidity checks, portfolio risk. Unknown data defaults to
 * caution/block per the spec, so every field that isn't a plain boolean
 * accepts `null` for "unknown" and is treated as a block.
 */
export interface SignalGates {
  eligibleUniverse: boolean;
  operatingCandleClosed: boolean;
  staleData: boolean;
  /** True = a binary event (earnings, etc.) falls inside the expected Novice hold period. Unknown blocks. */
  binaryEventInHoldPeriod: boolean | null;
  liquiditySpreadPass: boolean;
  benchmarkSectorAlignment: boolean;
  targetRoomAvailable: boolean;
  stopWithinNovicePolicy: boolean;
  positionSizeAvailable: boolean;
  correlationConcentrationPass: boolean;
  cooldownPass: boolean;
  totalOpenRiskPass: boolean;
  /** Non-adjusted/incorrect data, or an unsupported session condition. */
  dataQualityOk: boolean;
}

export interface SignalPlan {
  direction: Exclude<Direction, "none">;
  entryTrigger: number;
  entryDescription: string;
  stop: number;
  target: number;
  targetDescription: string;
}

export type SignalVerdict =
  | {
      status: "disqualified";
      state: ScannerStateName;
      disqualifiers: SignalDisqualifier[];
    }
  | {
      status: "notImplemented";
      state: ScannerStateName;
      reason: string;
    }
  | {
      status: "evaluated";
      state: ScannerStateName;
      regime: RegimeRead;
      alignment: RulesAlignmentScore;
      /** Alignment tier qualifies (>=75, safety gates pass) AND no required disqualifier fired AND a plan is priced. */
      tradeable: boolean;
      plan: SignalPlan | null;
      expiresAfterBars: number;
      /**
       * True when one or more account-only gates (position sizing,
       * correlation/concentration, cooldown, total open risk) were supplied
       * as an optimistic placeholder rather than a real read of the user's
       * account — e.g. a market-wide scan that doesn't have a specific
       * account in scope. `tradeable` on such a verdict is a market-context
       * reading only and must be re-evaluated with real account gates
       * (`accountContextAssumed: false`) before it authorizes anything.
       */
      accountContextAssumed: boolean;
    };
