import { describe, expect, it } from "vitest";
import { evaluateDisqualifiers } from "@/lib/signals/disqualifiers";
import { CRITERIA_REGISTRY } from "@/lib/validation/criteria-registry";
import { assessNoviceEligibility } from "@/lib/universe/eligibility";
import { dataQualityPass } from "@/lib/universe/dataQuality";
import type { SignalGates } from "@/lib/signals/types";

// Q25 (owner, 2026-10-16): the earnings dates were generated from a reporting
// cadence, not a feed, and no source of the method gates a trade on a report
// date. The gate is gone from the signal states, their disqualifiers, the
// beginner universe and its data-quality check. The calendar stays on the
// dashboard as context.
const GATES = {
  eligibleUniverse: true,
  operatingCandleClosed: true,
  staleData: false,
  liquiditySpreadPass: true,
  targetRoomAvailable: true,
  stopWithinNovicePolicy: true,
  positionSizeAvailable: true,
  correlationConcentrationPass: true,
  cooldownPass: true,
  totalOpenRiskPass: true,
  dataQualityOk: true,
} as SignalGates;

describe("no earnings-date gate", () => {
  it("raises no event disqualifier", () => {
    expect(evaluateDisqualifiers(GATES)).toEqual([]);
  });

  it("scores no event criterion in any signal state", () => {
    expect(CRITERIA_REGISTRY.some((c) => c.id.includes("BinaryEvent") || c.id === "binaryEvent")).toBe(false);
  });

  it("runs no event filter on the beginner universe", () => {
    const now = new Date();
    const verdict = assessNoviceEligibility({
      symbol: "AAPL",
      marketCapUsd: 3_000_000_000_000,
      avgDailyDollarVolume: 1_000_000_000,
      price: 50,
      fractionalConfirmed: null,
      spreadQuote: null,
      dailyBars: [],
      dataQuality: { quote: null, corporateActions: null, fundamentals: null, now },
    } as unknown as Parameters<typeof assessNoviceEligibility>[0]);
    expect(verdict.filters.some((f) => f.key === "event_risk_pass")).toBe(false);
  });

  it("does not fail data quality on a missing report date", () => {
    const now = new Date();
    const r = dataQualityPass({
      quote: { timestamp: now.toISOString(), exchangeSession: "regular", adjusted: true, latencyStatus: "live" },
      corporateActions: null,
      fundamentals: { asOfDate: now, sourceConsistent: true },
      now,
    } as unknown as Parameters<typeof dataQualityPass>[0]);
    expect(r.reason ?? "").not.toMatch(/Earnings/);
  });
});
