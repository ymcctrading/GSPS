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
    requiredRegime: "trend",
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
