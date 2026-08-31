/**
 * `data_quality_pass` and the spec's "Data contracts and freshness" table.
 *
 * The spec lists six data elements (quotes/OHLCV, corporate actions,
 * earnings/events, fundamentals/market cap, account/holdings, broker
 * execution) each with required source properties and a fail-safe behavior.
 * `data_quality_pass` — one of the seven `novice_eligible` filters — only
 * covers the first four, which is everything a symbol-only universe read can
 * judge without a specific account in scope; account/holdings and broker
 * execution feed `account_risk_pass` and `lib/universe/smallAccount.ts`
 * instead, once an account is in scope. Keeping the two apart mirrors why
 * `lib/signals/types.ts`'s `SignalGates` separates market-only gates from
 * account-only ones.
 */

import { MAX_FUNDAMENTALS_STALENESS_DAYS, MAX_QUOTE_STALENESS_SECONDS } from "./config";
import type { UniverseFilterResult } from "./types";

/** `policy_values`-overridable ceilings — see lib/universe/policy.ts. Defaults are the same constants this file always used. */
export interface DataQualityThresholds {
  maxQuoteStalenessSeconds: number;
  maxFundamentalsStalenessDays: number;
}

export const DEFAULT_DATA_QUALITY_THRESHOLDS: DataQualityThresholds = {
  maxQuoteStalenessSeconds: MAX_QUOTE_STALENESS_SECONDS,
  maxFundamentalsStalenessDays: MAX_FUNDAMENTALS_STALENESS_DAYS,
};

export interface QuoteQuality {
  timestamp: string | Date;
  /** e.g. "NASDAQ regular", "after-hours" — required so a session-crossing read isn't compared to the wrong bar. */
  exchangeSession: string | null;
  adjusted: boolean;
  /** Provider-reported latency status; `"stale"` fails regardless of the raw timestamp math. */
  latencyStatus: "live" | "delayed" | "stale";
}

export interface CorporateActionQuality {
  /** False when a known split/dividend has not yet been folded into historical coordinates. */
  adjustmentsApplied: boolean;
  /** False when the action lacks a stable identifier to audit against. */
  identified: boolean;
}

export interface EarningsEventQuality {
  /** Null when no date is known at all — distinct from a known date with low confidence. */
  dateTimeZone: string | null;
  confidence: "confirmed" | "estimated" | "unknown";
  source: string | null;
}

export interface FundamentalsQuality {
  asOfDate: string | Date;
  /** False when the market-cap figure and the price it was derived from come from different providers/timestamps. */
  sourceConsistent: boolean;
}

export interface DataQualityInputs {
  quote: QuoteQuality | null;
  corporateActions: CorporateActionQuality | null;
  earningsEvent: EarningsEventQuality | null;
  fundamentals: FundamentalsQuality | null;
  now?: Date;
}

/**
 * `data_quality_pass`. Every sub-check is independent and reported, so a
 * caller can show all of them rather than only the first failure — same
 * convention as every other filter in this directory.
 */
export function dataQualityPass(
  inputs: DataQualityInputs,
  thresholds: DataQualityThresholds = DEFAULT_DATA_QUALITY_THRESHOLDS,
): UniverseFilterResult {
  const failures: string[] = [];
  const now = inputs.now ?? new Date();

  const quoteFail = quoteFreshnessFail(inputs.quote, now, thresholds);
  if (quoteFail) failures.push(quoteFail);

  const corpFail = corporateActionFail(inputs.corporateActions);
  if (corpFail) failures.push(corpFail);

  const earningsFail = earningsEventFail(inputs.earningsEvent);
  if (earningsFail) failures.push(earningsFail);

  const fundamentalsFail = fundamentalsFail_(inputs.fundamentals, now, thresholds);
  if (fundamentalsFail) failures.push(fundamentalsFail);

  if (failures.length === 0) {
    return { key: "data_quality_pass", pass: true, reason: null };
  }
  return { key: "data_quality_pass", pass: false, reason: failures.join(" ") };
}

function quoteFreshnessFail(quote: QuoteQuality | null, now: Date, thresholds: DataQualityThresholds): string | null {
  if (quote === null) {
    return "No quote/OHLCV read available.";
  }
  if (quote.latencyStatus === "stale") {
    return "Quote feed reports stale latency — no new high-tier signal on stale data.";
  }
  if (!quote.exchangeSession) {
    return "Quote is missing its exchange/session designation.";
  }
  const ts = new Date(quote.timestamp).getTime();
  if (!Number.isFinite(ts)) {
    return "Quote timestamp is unreadable.";
  }
  const ageSeconds = (now.getTime() - ts) / 1000;
  if (ageSeconds > thresholds.maxQuoteStalenessSeconds) {
    return `Quote is ${Math.round(ageSeconds)}s old, beyond the ${thresholds.maxQuoteStalenessSeconds}s freshness policy.`;
  }
  return null;
}

function corporateActionFail(ca: CorporateActionQuality | null): string | null {
  if (ca === null) return null; // absence of a corporate-action record is not itself a failure — most symbols have none pending.
  if (!ca.adjustmentsApplied) {
    return "A split/dividend adjustment has not been folded into historical coordinates yet.";
  }
  if (!ca.identified) {
    return "A corporate action lacks a stable identifier to audit against.";
  }
  return null;
}

function earningsEventFail(event: EarningsEventQuality | null): string | null {
  if (event === null || event.confidence === "unknown" || !event.dateTimeZone) {
    return "Earnings/event date is unknown or ambiguous — no Novice entry without a confirmed calendar read.";
  }
  return null;
}

function fundamentalsFail_(f: FundamentalsQuality | null, now: Date, thresholds: DataQualityThresholds): string | null {
  if (f === null) {
    return "No fundamentals/market-cap as-of date available.";
  }
  if (!f.sourceConsistent) {
    return "Market cap and its underlying price come from inconsistent sources/timestamps.";
  }
  const asOf = new Date(f.asOfDate).getTime();
  if (!Number.isFinite(asOf)) {
    return "Fundamentals as-of date is unreadable.";
  }
  const ageDays = (now.getTime() - asOf) / (24 * 3600 * 1000);
  if (ageDays > thresholds.maxFundamentalsStalenessDays) {
    return `Fundamentals are ${Math.round(ageDays)} days stale, beyond the ${thresholds.maxFundamentalsStalenessDays}-day policy — a stale cap cannot certify eligibility.`;
  }
  return null;
}
