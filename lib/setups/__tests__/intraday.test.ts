import { describe, expect, it } from "vitest";
import { buildIntradayCardModel, buildIntradaySynopsis, intradayChartPlan, intradayLevels, isReversalRisk } from "@/lib/setups/intraday";
import type { Alert } from "@/lib/scanner/intraday";

const alert: Alert = {
  symbol: "SPY",
  kind: "etf",
  type: "old_level_cross",
  direction: "up",
  triggerTime: "2026-08-07T15:33:00.000Z",
  dataTimestamp: "2026-08-07T15:17:00.000Z",
  dataAgeSeconds: 960,
  move: { basis: "prior_close", reference: 500, current: 504.5, absolute: 4.5, percent: 0.9, direction: "up" },
  midpoint: 502.1,
  relativeVolume: 1.8,
  sessionVolume: 62_000_000,
  confidence: 75,
  confidenceFactors: [
    { label: "Opening range broken", passed: true, detail: "Price is 3.50 beyond the high." },
    { label: "Volume confirms", passed: false, detail: "1.8× of normal." },
  ],
  invalidation: 500,
  continuationPlan: { confirmation: "Wait.", invalidation: 500, firstTarget: 513.5, cancelIf: "x" },
  pivotPlan: { confirmation: "y", invalidation: 504.9, firstTarget: 502.1, cancelIf: "z" },
  whyThisAppeared: "SPY broke out.",
  whyNotEarlier: null,
};

describe("intradayLevels", () => {
  it("waits on the price the move had reached, exits at the invalidation, targets the plan's first target, and has no MTP when none lies beyond it", () => {
    expect(intradayLevels(alert)).toEqual({ entry: 504.5, stop: 500, tp1: 513.5, mtp: null });
  });

  it("carries the plan's MTP when a level lies beyond the first target", () => {
    const withMaster: Alert = { ...alert, continuationPlan: { ...alert.continuationPlan, masterTarget: 520 } };
    expect(intradayLevels(withMaster).mtp).toBe(520);
  });

  it("prices nothing for a reversal-risk warning", () => {
    const risk: Alert = { ...alert, type: "reversal_risk", direction: "down" };
    expect(isReversalRisk(risk)).toBe(true);
    expect(intradayLevels(risk)).toEqual({ entry: null, stop: null, tp1: null, mtp: null });
  });
});

describe("buildIntradaySynopsis", () => {
  it("counts the confidence factors that passed and states the plan in the daily card's terms", () => {
    expect(buildIntradaySynopsis(alert)).toBe(
      "Old top or bottom crossed, up: 1 of 2 checks line up (confidence 75/100). " +
        "Wait for a bar to close above $504.50, exit at $500.00 if it fails, first target $513.50 (2.0× the risk).",
    );
  });

  it("reads a down move as below", () => {
    const down: Alert = {
      ...alert,
      direction: "down",
      invalidation: 510,
      continuationPlan: { ...alert.continuationPlan, firstTarget: 495 },
    };
    expect(buildIntradaySynopsis(down)).toContain("Wait for a bar to close below $504.50");
  });

  it("says no target is fixed, and that the stop trails, when no old level lies ahead", () => {
    const open: Alert = { ...alert, continuationPlan: { ...alert.continuationPlan, firstTarget: null } };
    const up = buildIntradaySynopsis(open);
    expect(up).toContain("Wait for a bar to close above $504.50, exit at $500.00 if it fails.");
    expect(up).toContain("No target is fixed");
    expect(up).toContain("trails under each higher bottom");
    const down = buildIntradaySynopsis({
      ...open,
      direction: "down",
      invalidation: 510,
      continuationPlan: { ...open.continuationPlan, firstTarget: null },
    });
    expect(down).toContain("trails under each lower top");
  });

  it("frames a reversal risk as a reason to stand aside, in the scanner's own words", () => {
    const risk: Alert = { ...alert, type: "reversal_risk", direction: "down", whyThisAppeared: "It failed." };
    const text = buildIntradaySynopsis(risk);
    expect(text).toContain("a reason to stand aside, not a reason to trade the other way");
    expect(text).toContain("It failed.");
    expect(text).not.toContain("Wait for a bar");
  });
});

describe("buildIntradayCardModel", () => {
  it("is a buy for an up move and lists every confidence factor as a check", () => {
    const model = buildIntradayCardModel(alert);
    expect(model.side).toBe("buy");
    expect(model.price).toBe(504.5);
    expect(model.verdict).toBe("Old top or bottom crossed");
    expect(model.checks).toEqual([
      { label: "Opening range broken", state: "met", detail: "Price is 3.50 beyond the high." },
      { label: "Volume confirms", state: "missed", detail: "1.8× of normal." },
    ]);
    expect(model.tickerHref).toBe("/ticker/SPY");
  });
});

describe("intradayChartPlan", () => {
  const recent = [
    { symbol: "SPY", type: "old_level_cross" as const, direction: "up" as const, entry: 503, stop: 501, firstTarget: 507, masterTarget: null, confidence: 60, at: "2026-08-07T14:00:00Z" },
  ];

  it("draws the highest-confidence alert offered as a trade for the symbol", () => {
    const weaker: Alert = { ...alert, confidence: 40, invalidation: 499, continuationPlan: { ...alert.continuationPlan, invalidation: 499 } };
    expect(intradayChartPlan("spy", [weaker, alert], recent)).toEqual({ entry: 504.5, stop: 500, firstTarget: 513.5, masterTarget: null });
  });

  it("draws nothing for an alert not offered as a trade: a reversal risk, a target that doesn't pay the risk, no target, measured losing, or another symbol", () => {
    const none = [
      { ...alert, type: "reversal_risk" as const },
      { ...alert, continuationPlan: { ...alert.continuationPlan, paysRisk: false } },
      { ...alert, continuationPlan: { ...alert.continuationPlan, firstTarget: null } },
      { ...alert, type: "plan_level_held" as const },
      { ...alert, symbol: "QQQ" },
    ];
    for (const a of none) expect(intradayChartPlan("SPY", [a], recent)).toBeNull();
  });

  it("uses today's scheduled alert only before a scan has been read", () => {
    expect(intradayChartPlan("SPY", null, recent)).toEqual({ entry: 503, stop: 501, firstTarget: 507, masterTarget: null });
    expect(intradayChartPlan("SPY", [], recent)).toBeNull();
    expect(intradayChartPlan("SPY", null, [{ ...recent[0], type: "plan_level_held" }])).toBeNull();
  });
});
