import { describe, expect, it } from "vitest";
import { buildIntradayCardModel, buildIntradaySynopsis, intradayLevels, isReversalRisk } from "@/lib/setups/intraday";
import type { Alert } from "@/lib/scanner/intraday";

const alert: Alert = {
  symbol: "SPY",
  kind: "etf",
  type: "opening_momentum",
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
    { label: "Opening range broken", passed: true, weight: 30, detail: "Price is 3.50 beyond the high." },
    { label: "Volume confirms", passed: false, weight: 25, detail: "1.8× of normal." },
  ],
  invalidation: 500,
  continuationPlan: { confirmation: "Wait.", invalidation: 500, firstTarget: 513.5, cancelIf: "x" },
  pivotPlan: { confirmation: "y", invalidation: 504.9, firstTarget: 502.1, cancelIf: "z" },
  whyThisAppeared: "SPY broke out.",
  whyNotEarlier: null,
};

describe("intradayLevels", () => {
  it("waits on the price the move had reached, exits at the invalidation, targets the plan's first target, and has no MTP", () => {
    expect(intradayLevels(alert)).toEqual({ entry: 504.5, stop: 500, tp1: 513.5, mtp: null });
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
      "Opening momentum, up: 1 of 2 checks line up (confidence 75/100). " +
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
    expect(model.verdict).toBe("Opening momentum");
    expect(model.checks).toEqual([
      { label: "Opening range broken", state: "met", detail: "30 pts — Price is 3.50 beyond the high." },
      { label: "Volume confirms", state: "missed", detail: "25 pts — 1.8× of normal." },
    ]);
    expect(model.tickerHref).toBe("/ticker/SPY");
    expect(model.alignmentScore).toBeNull();
  });
});
