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
import type { DecadeCycleReading } from "@/lib/gann/decadeCycle";
import type { MacroCycleResult } from "@/lib/gann/macroCycle";
import type { MasterTwelveLevel } from "@/lib/gann/masterTwelve";
import type { SquareOf52Result } from "@/lib/gann/squareOf52";
import type { AngleMonthCountResult } from "@/lib/gann/angleMonthCounts";
import type { SpectralCycleReading } from "@/lib/gann/spectralCycle";
import type { CampaignLegReading } from "@/lib/gann/swingChart";
import type { BoilingPointReading } from "@/lib/gann/boilingPoint";
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
  /** A4's fixed annual calendar window — see `lib/gann/timeCycles.ts`'s header. */
  timeCycleFixedCalendarActive: boolean;
  timeCycleFixedCalendarDates: string[];
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
   * Gann's "decade digit" bull/bear cycle (`docs/GANN_HISTORICAL_SOURCES.md`
   * A2.1 Ch. 7) — which year of the current calendar decade this is, and the
   * market character Gann assigned to it. Calendar-only (no per-symbol
   * anchor), confluence/context only per AGENTS.md's "Hermetic principles &
   * cycle theory" standing principle — a labeled hypothesis, never a scored
   * criterion, same treatment as `vortexContext` above. See
   * `lib/gann/decadeCycle.ts`.
   */
  decadeCycle: DecadeCycleReading;
  /**
   * Gann's major/minor time-cycle hierarchy run one level up from
   * `timeCycleActive`/`timeCycleDates` — recurring anniversary months of
   * Gann's own cited DJIA turns (`docs/GANN_HISTORICAL_SOURCES.md` A2.1
   * Ch. 7's worked case study) instead of this symbol's own pivots.
   * Calendar-only and identical for every symbol on a date, so it is
   * backdrop, never a per-setup discriminator. Confluence/context only,
   * same hypothesis-labeled, never-gating treatment as `decadeCycle` and
   * `spectralCycle`. See `lib/gann/macroCycle.ts`.
   */
  macroCycle: MacroCycleResult;
  /**
   * Square of 144/"Master Twelve" nearest level (`docs/GANN_HISTORICAL_SOURCES.md`
   * A2.1 Ch. 13) — the base-12 analog of `nearestSquareOf9`, same spiral
   * construction generalized to 12-fold angular resolution, nested inside
   * the Square of Nine's own grid (20,736 halves down to 81 = 9²). Wired in
   * 2026-09-16 per AGENTS.md's cross-platform-consistency rule: it was built
   * the same session as `nearestSquareOf9`/`nearestFanLine` but had been left
   * stranded, unlike squareOf20/hexagonChart which stay research-only for a
   * documented, technical reason (lost original chart illustrations mean
   * their ring/angle placement can't be verified — see those modules'
   * headers). Confluence/ranking only, same non-authoritative role as
   * `nearestSquareOf9`. See `lib/gann/masterTwelve.ts`.
   */
  nearestMasterTwelve: MasterTwelveLevel | null;
  /**
   * Square of 52 / Master Calculator for Weekly Time Periods
   * (`docs/GANN_HISTORICAL_SOURCES.md` A2.1 Ch. 14) — disclosed fractional
   * divisions of a 52-week cycle projected from major swing pivots, same
   * `{active, dates}` shape as `timeCycleActive`/`timeCycleDates`. Wired in
   * 2026-09-16 for the same reason as `nearestMasterTwelve` above — no
   * bull/bear polarity, never independently scored. See
   * `lib/gann/squareOf52.ts`.
   */
  squareOf52: SquareOf52Result;
  /**
   * Gann's 36-angle month-counts (`docs/GANN_HISTORICAL_SOURCES.md` A2.1
   * Ch. 7) — the 11.25°-step/32-way division of 360° read as month-counts
   * from a major swing, restricted by default to the 12 "very important"
   * starred angles. Wired in 2026-09-16 for the same reason as
   * `nearestMasterTwelve` above — pure date arithmetic against confirmed
   * pivots, no lost-illustration dependency. See `lib/gann/angleMonthCounts.ts`.
   */
  angleMonthCounts: AngleMonthCountResult;
  /**
   * Fourier/spectral dominant-cycle detection (`docs/GANN_HISTORICAL_SOURCES.md`
   * A3, B1) — Gann's own "harmonic analysis"/"Law of Vibration" claim,
   * reconstructed as a real periodogram-style detector. Confluence/context
   * only, gated through Dewey's cycle-validation checklist per AGENTS.md's
   * "Hermetic principles & cycle theory" standing principle — a labeled
   * hypothesis, never a scored criterion, same treatment as `decadeCycle`
   * above. See `lib/gann/spectralCycle.ts`.
   */
  spectralCycle: SpectralCycleReading;
  /**
   * Gann's "sections of a campaign" leg count (`docs/GANN_HISTORICAL_SOURCES.md`
   * A5/A8/A9) — how many 3-day swing-chart legs have printed since the last
   * 9-day trend change, classified against his disclosed 3-4-leg reversal
   * pattern. Confluence/context only, same non-authoritative role as every
   * other field here — never changes `swingChartAligned`'s scored pass/fail
   * in `lib/scoring/score.ts`. See `lib/gann/swingChart.ts#computeCampaignLeg`.
   */
  campaignLeg: CampaignLegReading;
  /**
   * "Boiling point" blow-off duration off the same volume-climax anchors
   * used elsewhere in this platform (`docs/GANN_HISTORICAL_SOURCES.md` A4)
   * — how many weeks have elapsed since a detected climax, classified
   * against the disclosed 6-7-week (rarely past 10) exhaustion window.
   * Confluence/context only, same non-authoritative role as every other
   * field here. See `lib/gann/boilingPoint.ts`.
   */
  boilingPoint: BoilingPointReading[];
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
