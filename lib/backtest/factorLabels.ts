/**
 * The backtest report as the Test page reads it, with no internal ids.
 *
 * `BacktestReport` keys each factor row by the score breakdown's internal id
 * (the nine pillars, the checks under them, the holds that cap a verdict), and
 * carries splits keyed by exit-rule and context-factor ids. Several of those
 * ids name the method behind the score, and a route's JSON is readable by any
 * browser, so `GET /api/backtest` returns this whitelisted shape instead
 * (owner's confidential-sources rule, 2026-10-28): each factor row is given a
 * neutral public id and a plain label here, on the server, and the fields the
 * page never shows are left out. The full report stays available to the
 * universe runs, which call `runBacktest` directly.
 *
 * Checks score nothing alone (`ScoreBreakdownItem.checkOf`), so each carries
 * the label of the scored point it counts toward: comparing a check with its
 * point needs to know which point it is. Checks and holds are named by
 * number only; the nine points keep the labels every surface already shows.
 *
 * `planLevelsParam` is the route's `planLevels` default, kept here so a
 * test can pin it (a route file exports only its handlers).
 */

import type { FactorAttribution } from "./attribution";
import type { BacktestReport, RunSummary } from "./run";
import { CRITERION_LABELS, type CriterionKey } from "@/lib/scoring/weights";

export type FactorKind = "point" | "check" | "hold" | "other";

interface FactorName {
  /** The neutral id the browser sees. */
  id: string;
  label: string;
  kind: FactorKind;
  /** For a check: the scored point it counts toward. */
  partOf?: CriterionKey;
}

/**
 * The checks under each scored point, in a fixed order. Shown as opaque rows
 * ("Check 2 under Trend on every timeframe"): a description of what a check
 * reads would describe the method (second review of #506, 2026-10-28).
 */
const CHECK_ORDER: Array<[string, CriterionKey]> = [
  ["swingChartTrend", "trendAllTimeframes"],
  ["ruleOfThree", "trendAllTimeframes"],
  ["gannAngleSlope", "geometricAngles"],
  ["volumeClimax", "volumeAccumulation"],
  ["historicalSR", "priceLevels"],
  ["gannRetracementConfluence", "priceLevels"],
  ["entryTriggerArmed", "definiteIndication"],
  ["stopBehindOldLevel", "definiteIndication"],
  ["timePriceSquare", "timeFactors"],
];

const CHECKS: Record<string, FactorName> = Object.fromEntries(
  CHECK_ORDER.map(([key, partOf]) => {
    const n = CHECK_ORDER.filter(([, p]) => p === partOf).findIndex(([k]) => k === key) + 1;
    return [key, { id: `${partOf}-check-${n}`, label: `Check ${n} under ${CRITERION_LABELS[partOf]}`, kind: "check" as const, partOf }];
  }),
);

/** The holds that can keep a setup from Execute, opaque for the same reason. */
const HOLD_ORDER = [
  "tradePlanPriced",
  "dataLag",
  "breakaway",
  "monthlyBreak",
  "distributionBreakdown",
  "failedTop",
  "queerActing",
  "figureCrossing",
  "weakStock",
  "timeWindowTurn",
  "standAside",
  "stopBreach",
  "readyNow",
  "planExpired",
  "campaignSection",
  "marketTrend",
];

const HOLDS: Record<string, FactorName> = Object.fromEntries(
  HOLD_ORDER.map((key, i) => [key, { id: `hold-${i + 1}`, label: `Execute condition ${i + 1}`, kind: "hold" as const }]),
);

/** The public name of a breakdown id. An id with no entry is "Other check", never the id. */
export function factorName(key: string, index = 0): FactorName {
  if (Object.hasOwn(CRITERION_LABELS, key)) return { id: key, label: CRITERION_LABELS[key as CriterionKey], kind: "point" };
  return (Object.hasOwn(CHECKS, key) ? CHECKS[key] : Object.hasOwn(HOLDS, key) ? HOLDS[key] : null) ?? { id: `other${index}`, label: "Other check", kind: "other" };
}

const KIND_ORDER: Record<FactorKind, number> = { point: 0, check: 1, hold: 2, other: 3 };

export interface PublicFactor extends Omit<FactorAttribution, "criterion"> {
  id: string;
  label: string;
  kind: FactorKind;
  /** For a check: the label of the scored point it counts toward. */
  partOf?: string;
}

/** Factor rows renamed, scored points first, then their checks, then the holds. */
export function publicFactors(factors: FactorAttribution[]): PublicFactor[] {
  return factors
    .map((f, i) => {
      const { criterion, ...rest } = f;
      const name = factorName(criterion, i);
      return {
        ...rest,
        id: name.id,
        label: name.label,
        kind: name.kind,
        ...(name.partOf ? { partOf: CRITERION_LABELS[name.partOf] } : {}),
      };
    })
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

export interface PublicBacktestReport {
  source: string;
  live: boolean;
  timeframe: BacktestReport["timeframe"];
  symbols: string[];
  skipped: BacktestReport["skipped"];
  window: BacktestReport["window"];
  overall: RunSummary;
  buckets: BacktestReport["buckets"];
  largeCapSplit: BacktestReport["largeCapSplit"];
  derivedSplit: BacktestReport["derivedSplit"];
  armed: number;
  triggered: number;
  attributeWithin: string;
  factors: PublicFactor[];
  atrBands: BacktestReport["atrBands"];
  generatedAt: string;
}

/** The report fields the Test page and the Guided figure read, and nothing else. */
export function toPublicReport(report: BacktestReport): PublicBacktestReport {
  return {
    source: report.source,
    live: report.live,
    timeframe: report.timeframe,
    symbols: report.symbols,
    skipped: report.skipped,
    window: report.window,
    overall: report.overall,
    buckets: report.buckets,
    largeCapSplit: report.largeCapSplit,
    derivedSplit: report.derivedSplit,
    armed: report.armed,
    triggered: report.triggered,
    attributeWithin: report.attributeWithin,
    factors: publicFactors(report.factors),
    atrBands: report.atrBands,
    generatedAt: report.generatedAt,
  };
}

/** `?planLevels`: on unless "0" or "false", so the Test page trades production's plan. */
export function planLevelsParam(raw: string | null): boolean {
  return !(raw === "0" || raw === "false");
}
