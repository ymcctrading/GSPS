/**
 * Shared types for the Gann Confluence Layer and Sara Sniper Strat Confluence
 * Layer — two modular, versioned, feature-flagged confluence modules that
 * plug into the Signal and Regime Engine (`lib/signals`) per the "GSPS Gann &
 * Sara Cross-Market Integration Addendum" (2026-08-28).
 *
 * Both modules are additive and non-authoritative: they attach an
 * alignment/conflict/neutral read alongside the four scanner states'
 * verdicts, never merged into them and never able to override a safety gate,
 * account/risk control, or eligibility check (see `docs/GANN_SARA_CONFLUENCE.md`
 * for the full decision-hierarchy contract).
 */

import type { StratPattern } from "@/lib/types";
import type { S9Level } from "@/lib/gann/squareOf9";
import type { FanLine } from "@/lib/gann/fans";
import type { MarketAdapterStatus, SupportedMarket } from "./marketAdapters";

/**
 * `notImplemented` covers both "the market adapter doesn't exist yet" and
 * "this classification is pending an authorized written specification" — see
 * `GannConfluenceResult.materialNumberClassification`. Neither is a failure;
 * both are an honest "nothing to say yet" rather than a fabricated read.
 */
export type ConfluenceAlignment = "aligned" | "conflict" | "neutral" | "notImplemented";

export interface ConfluenceModuleMeta {
  moduleId: string;
  moduleType: "gann" | "sara";
  displayName: string;
  /** Provenance: where the logic actually comes from, for the audit trail. */
  authorizedSource: string;
  version: string;
}

export interface ConfluenceEvidence {
  calculationVersion: string;
  inputs: Record<string, unknown>;
  sourceTimestamp: string;
  /** Human-readable trace of what was computed and why — the explanation trace the addendum requires on every output. */
  explanationTrace: string[];
}

export interface GannConfluenceResult {
  module: ConfluenceModuleMeta;
  market: SupportedMarket;
  marketAdapterStatus: MarketAdapterStatus;
  alignment: ConfluenceAlignment;
  /** sqrt(anchor price) — the Square of 9 root the coordinate context is built from. */
  root: number | null;
  nearestSquareOf9: S9Level | null;
  nearestFanLine: FanLine | null;
  timeCycleActive: boolean;
  timeCycleDates: string[];
  /**
   * The addendum's "Material Number versus Harmonic Node classification" is
   * personally sourced numerical logic that has not been supplied in an
   * authorized written specification. Per the addendum, Claude Code must not
   * infer missing rules — this stays `notImplemented` until that
   * specification exists and is reviewed.
   */
  materialNumberClassification: "notImplemented";
  evidence: ConfluenceEvidence;
  note: string;
}

export interface SaraConfluenceResult {
  module: ConfluenceModuleMeta;
  market: SupportedMarket;
  marketAdapterStatus: MarketAdapterStatus;
  alignment: ConfluenceAlignment;
  scenarioId: StratPattern["name"] | null;
  direction: StratPattern["direction"] | "none";
  timeframeContinuity: "confirmed" | "notConfirmed";
  confirmationState: "closedBarConfirmed" | "noArmedScenario";
  evidence: ConfluenceEvidence;
  note: string;
}
