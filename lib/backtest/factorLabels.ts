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
 * point needs to know which point it is.
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

const CHECKS: Record<string, FactorName> = {
  swingChartTrend: { id: "swingsAgree", label: "Daily and weekly swings agree", kind: "check", partOf: "trendAllTimeframes" },
  ruleOfThree: { id: "threeCloses", label: "Three closes in a row with the trade", kind: "check", partOf: "trendAllTimeframes" },
  gannAngleSlope: { id: "trendSlope", label: "Trend climbing steeply enough", kind: "check", partOf: "geometricAngles" },
  volumeClimax: { id: "turnVolume", label: "Volume at the turn", kind: "check", partOf: "volumeAccumulation" },
  historicalSR: { id: "oldLevelHeld", label: "Held at an old support or resistance", kind: "check", partOf: "priceLevels" },
  gannRetracementConfluence: { id: "percentLevelHeld", label: "Held at a halfway or percentage level", kind: "check", partOf: "priceLevels" },
  entryTriggerArmed: { id: "entrySignal", label: "Entry signal armed", kind: "check", partOf: "definiteIndication" },
  stopBehindOldLevel: { id: "stopBehindLevel", label: "Stop sits behind an old level", kind: "check", partOf: "definiteIndication" },
  timePriceSquare: { id: "priceTimeBalance", label: "Price and time in balance", kind: "check", partOf: "timeFactors" },
};

const HOLDS: Record<string, FactorName> = {
  tradePlanPriced: { id: "planPriced", label: "Trade plan priced", kind: "hold" },
  dataLag: { id: "dataCurrent", label: "Data current enough to act on", kind: "hold" },
  breakaway: { id: "rangeBreakout", label: "Breakout from a sideways range", kind: "hold" },
  monthlyBreak: { id: "monthHeld", label: "No break of last month's low or high", kind: "hold" },
  distributionBreakdown: { id: "noBreakdown", label: "No breakdown after a lower top", kind: "hold" },
  failedTop: { id: "pathClear", label: "No failed double top or bottom in the way", kind: "hold" },
  queerActing: { id: "actsNormally", label: "Stock acting normally", kind: "hold" },
  figureCrossing: { id: "roundNumber", label: "Not the first or second time through a round number", kind: "hold" },
  weakStock: { id: "strongPosition", label: "Stock in a strong position", kind: "hold" },
  timeWindowTurn: { id: "timingWindow", label: "Turn came at a timing window", kind: "hold" },
  standAside: { id: "trendToTrade", label: "A trend to trade with", kind: "hold" },
  stopBreach: { id: "stopIntact", label: "Plan's stop still intact", kind: "hold" },
  readyNow: { id: "readyNow", label: "Ready to place now, with clear targets", kind: "hold" },
  planExpired: { id: "planLive", label: "Plan still live", kind: "hold" },
};

/** The public name of a breakdown id. An id with no entry is "Other check", never the id. */
export function factorName(key: string, index = 0): FactorName {
  if (key in CRITERION_LABELS) return { id: key, label: CRITERION_LABELS[key as CriterionKey], kind: "point" };
  return CHECKS[key] ?? HOLDS[key] ?? { id: `other${index}`, label: "Other check", kind: "other" };
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
