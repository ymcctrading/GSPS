import { describe, expect, it } from "vitest";
import {
  validateThreeElementSubmission,
  scoreThreeElementSubmission,
  type ThreeElementSubmission,
} from "@/lib/school/bull-bear";

function baseSubmission(): ThreeElementSubmission {
  return {
    signal: {
      instrument: "AAPL",
      timeframe: "Daily",
      setupOrState: "Testing prior swing high resistance after a pullback",
      evidence: "Volume declining into the pullback, holding above the 50-day average",
      uncertainty: "Earnings in 9 days could override the technical setup",
      catalystOrEventContext: "Earnings scheduled next week",
      sourceProvenance: "GSPS scanner output, reviewed manually",
    },
    bull: {
      thesis: "A confirmed break of the prior swing high resumes the primary uptrend",
      supportingEvidence: "Higher lows over the last three weeks, volume contracting into resistance",
      confirmation: "Close above the swing high on above-average volume",
      entryCondition: "Break and hold above 187.50",
      upsideScenario: "Continuation to the prior all-time high",
      target: "195.00",
      thesisWeakeningConditions: "A close back below the prior higher low invalidates the setup",
    },
    bear: {
      contradictoryEvidence: "The declining volume into the pullback the Bull case cites as bullish could equally mean interest is fading before earnings",
      invalidation: "A close below the most recent higher low at 182",
      hardStop: "181.50",
      liquidityVolatilityEventRisk: "Earnings in 9 days adds event risk that could gap through the stop",
      positionSizeConsequence: "Reduce size 50% given the earnings-week gap risk",
    },
    operator: {
      action: "reduced_risk_entry",
      nextObservableCondition: "Confirmed close above 187.50 on above-average volume",
      riskAction: "Half normal size, tightened stop before earnings",
      reversalCondition: "Close below 182 invalidates and exits",
    },
  };
}

describe("validateThreeElementSubmission", () => {
  it("passes a complete, specific submission", () => {
    const result = validateThreeElementSubmission(baseSubmission(), { requiresRegimeCheckpoint: false });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects empty required fields", () => {
    const submission = baseSubmission();
    submission.bull.thesis = "";
    const result = validateThreeElementSubmission(submission, { requiresRegimeCheckpoint: false });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("bull.thesis"))).toBe(true);
  });

  it("rejects a generic Bear challenge that never engages with the Bull case or Signal", () => {
    const submission = baseSubmission();
    submission.bear.contradictoryEvidence = "Prices can go up or down and trading involves risk generally speaking";
    const result = validateThreeElementSubmission(submission, { requiresRegimeCheckpoint: false });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("bear.contradictoryEvidence"))).toBe(true);
  });

  it("rejects boilerplate one-word answers", () => {
    const submission = baseSubmission();
    submission.bear.invalidation = "none";
    const result = validateThreeElementSubmission(submission, { requiresRegimeCheckpoint: false });
    expect(result.ok).toBe(false);
  });

  it("requires a regime checkpoint when the lesson demands one", () => {
    const result = validateThreeElementSubmission(baseSubmission(), { requiresRegimeCheckpoint: true });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.startsWith("regime"))).toBe(true);
  });

  it("passes with a valid regime checkpoint attached", () => {
    const submission: ThreeElementSubmission = {
      ...baseSubmission(),
      regime: {
        trendRangeTransition: "trend",
        volatilityState: "Contracting, ATR below its 20-day average",
        liquidity: "Normal — average daily volume in line with the 30-day mean",
        scheduledCatalyst: "Earnings in 9 days",
        controllingTimeframe: "Daily",
        conflictingTimeframeEvidence: "Hourly chart shows a short-term downtrend within the daily uptrend",
        disqualifier: "none identified",
        actionState: "reduced_risk_entry",
      },
    };
    const result = validateThreeElementSubmission(submission, { requiresRegimeCheckpoint: true });
    expect(result.ok).toBe(true);
  });

  it("accepts a well-reasoned No Trade decision as fully valid", () => {
    const submission = baseSubmission();
    submission.operator.action = "no_trade";
    const result = validateThreeElementSubmission(submission, { requiresRegimeCheckpoint: false });
    expect(result.ok).toBe(true);
  });
});

describe("scoreThreeElementSubmission", () => {
  it("scores a well-formed submission with meaningful engagement above a boilerplate one", () => {
    const good = scoreThreeElementSubmission(baseSubmission());
    const weak = baseSubmission();
    weak.bear.contradictoryEvidence = "risk exists always";
    const weakScore = scoreThreeElementSubmission(weak);
    expect(good.total).toBeGreaterThan(weakScore.total);
  });

  it("does not penalize No Trade relative to an entry decision", () => {
    const entry = baseSubmission();
    entry.operator.action = "standard_risk_entry";
    const noTrade = baseSubmission();
    noTrade.operator.action = "no_trade";
    expect(scoreThreeElementSubmission(noTrade).decision).toEqual(scoreThreeElementSubmission(entry).decision);
  });
});
