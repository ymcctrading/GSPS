/**
 * Shared types for the Gann Confluence Layer and Sara Confluence Layer — two
 * modular, versioned, feature-flagged confluence modules that
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
import type { ConfluenceType, DigitalRootFeature, VortexClass } from "@/lib/gann/digitalRoot";
import type { NearestGannAngle } from "@/lib/gann/normalizedSlope";
import type { LedgerCoordinate } from "@/lib/gann/coordinateLedger";
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

/**
 * Blueprint section 18's `gann_context` shape: `price_dr`/`time_dr` plus
 * their `relationship`. `VORTEX_FLOW_TRANSITION`/`ONE_RENEWAL_TRANSITION`
 * need a prior reading to detect a change between successive roots —
 * nothing persists one yet (blueprint's `digital_root_feature` table is
 * Milestone 3), so `relationship` never reports either. `transition`
 * carries the same two types when the caller supplies a prior reading
 * in-memory (e.g. from an earlier scan of the same symbol this session);
 * it's `null` whenever no prior reading was supplied, not just when the
 * confirming bars are missing. See `classifyRootTransition` in
 * `lib/gann/digitalRoot.ts`.
 */
export interface GannVortexContext {
  priceDisplacement: DigitalRootFeature | null;
  timeDisplacement: DigitalRootFeature | null;
  priceVortexClass: VortexClass | null;
  timeVortexClass: VortexClass | null;
  relationship: ConfluenceType | null;
  transition: {
    price: ConfluenceType | null;
    time: ConfluenceType | null;
  } | null;
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
   * Prior Day/Week/Month high-low ranges and their eighths (range-fraction)
   * subdivisions — blueprint §8's "prior D/W/M high-low, range fractions"
   * candidate coordinates, as a single unified structure. `null` per period
   * when there isn't yet a completed prior bucket for it (e.g. under a week
   * of daily history for the week/month entries). See
   * `lib/gann/coordinateLedger.ts`.
   */
  coordinateLedger: CoordinateLedger;
  nearestLedgerLevel: NearestLedgerLevel | null;
  /**
   * The active 1–9 Digital Root/Vortex context, per the "GSPS Implementation
   * Blueprint" (2026-09-08) sections 2 and 7 — `price_dr`/`time_dr` and
   * their relationship, computed from normalized positive integers (never a
   * raw price), with full provenance on each feature. Context/confluence
   * only, per the blueprint's section 7.4 safety rule: never a sole signal,
   * never able to create/override an entry, stop, or gate. See
   * `lib/gann/digitalRoot.ts`.
   */
  vortexContext: GannVortexContext;
  /**
   * Blueprint §8.5's normalized Gann-angle slope — realized ATR-units-per-bar
   * since the anchor, and which fixed angle ratio (1x4…4x1) that's closest
   * to. Diagnostic only, same non-authoritative role as every other field
   * here. Null when there's no ATR/anchor to compute it from. See
   * `lib/gann/normalizedSlope.ts`.
   */
  angleSlope: { slope: number; nearestAngle: NearestGannAngle | null } | null;
  /**
   * Blueprint §8.3's prior daily/weekly/monthly high-low and range-fraction
   * candidate coordinates — context/confluence only, same non-authoritative
   * role as every other field here. See `lib/gann/coordinateLedger.ts`.
   */
  coordinateLedger: LedgerCoordinate[];
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
