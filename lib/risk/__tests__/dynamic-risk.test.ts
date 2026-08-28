import { describe, expect, it } from "vitest";
import {
  computePermittedRisk,
  quantityFromPermittedRisk,
  plannedRiskDollars,
  resolveRiskBand,
} from "@/lib/risk/dynamic-risk";

describe("resolveRiskBand", () => {
  it("stays at base under 20 completed trades regardless of score", () => {
    expect(
      resolveRiskBand({
        completedSwingTrades: 19,
        executionScore: 99,
        hasActiveCooldown: false,
        hasRepeatedRecentDisciplineBreach: false,
        hasVariedConditionsSample: true,
        hasNoCautionStates: true,
      }),
    ).toBe("base");
  });

  it("stays at base while a cooldown is active, regardless of trade count", () => {
    expect(
      resolveRiskBand({
        completedSwingTrades: 100,
        executionScore: 99,
        hasActiveCooldown: true,
        hasRepeatedRecentDisciplineBreach: false,
        hasVariedConditionsSample: true,
        hasNoCautionStates: true,
      }),
    ).toBe("base");
  });

  it("reaches exceptional_a_plus only with the full requirement set", () => {
    expect(
      resolveRiskBand({
        completedSwingTrades: 45,
        executionScore: 92,
        hasActiveCooldown: false,
        hasRepeatedRecentDisciplineBreach: false,
        hasVariedConditionsSample: true,
        hasNoCautionStates: true,
      }),
    ).toBe("exceptional_a_plus");
  });

  it("falls back to a_plus when the exceptional sample size isn't met yet", () => {
    expect(
      resolveRiskBand({
        completedSwingTrades: 25,
        executionScore: 92,
        hasActiveCooldown: false,
        hasRepeatedRecentDisciplineBreach: false,
        hasVariedConditionsSample: true,
        hasNoCautionStates: true,
      }),
    ).toBe("a_plus");
  });
});

describe("computePermittedRisk", () => {
  const budgets = {
    remainingDailyBudget: Infinity,
    remaining48hBudget: Infinity,
    remainingOpenRiskBudget: Infinity,
  };
  const neutralMultipliers = { setup: 1, execution: 1, market: 1, correlation: 1 };

  it("is zero outside normal/warning circuit states", () => {
    const r = computePermittedRisk({
      equity: 450,
      band: "base",
      multipliers: neutralMultipliers,
      budgets,
      circuitState: "hard_cooldown",
    });
    expect(r.permittedRiskUsd).toBe(0);
    expect(r.boundBy).toBe("circuit_breaker");
  });

  it("matches the $450 base illustration ($4.50 at 1.00%)", () => {
    const r = computePermittedRisk({
      equity: 450,
      band: "base",
      multipliers: neutralMultipliers,
      budgets,
      circuitState: "normal",
    });
    expect(r.permittedRiskUsd).toBeCloseTo(4.5, 6);
  });

  it("never exceeds the 2.00% absolute tier cap even with multipliers above 1", () => {
    const r = computePermittedRisk({
      equity: 450,
      band: "exceptional_a_plus", // 1.75%
      multipliers: { setup: 1.5, execution: 1.5, market: 1.2, correlation: 1 },
      budgets,
      circuitState: "normal",
    });
    expect(r.permittedRiskPct).toBeLessThanOrEqual(2.0 + 1e-9);
    expect(r.boundBy).toBe("absolute_tier_cap");
  });

  it("is bound by the tightest remaining budget when one is smaller than the rate", () => {
    const r = computePermittedRisk({
      equity: 450,
      band: "base",
      multipliers: neutralMultipliers,
      budgets: { ...budgets, remaining48hBudget: 2 },
      circuitState: "normal",
    });
    expect(r.permittedRiskUsd).toBe(2);
    expect(r.boundBy).toBe("48h_budget");
  });
});

describe("quantityFromPermittedRisk / plannedRiskDollars", () => {
  it("floors whole-share quantity from the permitted dollar risk", () => {
    expect(quantityFromPermittedRisk(9, 100, 91, false)).toBe(1); // 9 / 9 = 1
    expect(quantityFromPermittedRisk(20, 100, 95, false)).toBe(4); // 20 / 5 = 4
  });

  it("round-trips through plannedRiskDollars", () => {
    const qty = quantityFromPermittedRisk(45, 50, 45, false);
    expect(plannedRiskDollars(50, 45, qty)).toBeLessThanOrEqual(45);
  });
});
