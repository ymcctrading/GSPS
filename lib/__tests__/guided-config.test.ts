/**
 * Caps are read from a user-writable JSON column, so `resolveGuidedCaps` is a
 * trust boundary: a value it accepts is a limit the mode will honour on real
 * (paper) money.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_GUIDED_BUDGET_USD,
  DEFAULT_GUIDED_CAPS,
  MAX_GUIDED_BUDGET_USD,
  MAX_RISK_PCT,
  MIN_GUIDED_BUDGET_USD,
  MIN_RISK_PCT,
  resolveGuidedCaps,
} from "@/lib/guided/config";

describe("resolveGuidedCaps", () => {
  it("ships conservative defaults when nothing is stored", () => {
    expect(resolveGuidedCaps(null)).toEqual(DEFAULT_GUIDED_CAPS);
    expect(resolveGuidedCaps({})).toEqual(DEFAULT_GUIDED_CAPS);
  });

  it("honours a stored value inside the permitted range", () => {
    const caps = resolveGuidedCaps({ guided: { riskPct: 0.5, maxTradesPerDay: 5 } });
    expect(caps.riskPct).toBe(0.5);
    expect(caps.maxTradesPerDay).toBe(5);
    // Unset keys keep their defaults rather than being zeroed.
    expect(caps.maxDeployedPct).toBe(DEFAULT_GUIDED_CAPS.maxDeployedPct);
  });

  it("falls back to the default for a value outside the permitted range", () => {
    expect(resolveGuidedCaps({ guided: { riskPct: MAX_RISK_PCT + 1 } }).riskPct).toBe(
      DEFAULT_GUIDED_CAPS.riskPct,
    );
    expect(resolveGuidedCaps({ guided: { riskPct: MIN_RISK_PCT - 0.1 } }).riskPct).toBe(
      DEFAULT_GUIDED_CAPS.riskPct,
    );
    expect(resolveGuidedCaps({ guided: { maxDeployedPct: 500 } }).maxDeployedPct).toBe(
      DEFAULT_GUIDED_CAPS.maxDeployedPct,
    );
  });

  it("falls back rather than failing on junk", () => {
    expect(resolveGuidedCaps({ guided: { riskPct: "lots", maxTradesPerDay: null } })).toEqual(
      DEFAULT_GUIDED_CAPS,
    );
    expect(resolveGuidedCaps("not an object")).toEqual(DEFAULT_GUIDED_CAPS);
  });

  it("never lets a cap be disabled by writing zero", () => {
    const caps = resolveGuidedCaps({
      guided: { maxTradesPerDay: 0, maxDeployedPct: 0, riskPct: 0 },
    });
    expect(caps).toEqual(DEFAULT_GUIDED_CAPS);
  });

  it("ships the per-trade budget cap on by default, at the top of the novice range", () => {
    expect(resolveGuidedCaps(null).budgetUsd).toBe(DEFAULT_GUIDED_BUDGET_USD);
    expect(DEFAULT_GUIDED_CAPS.budgetUsd).toBe(MAX_GUIDED_BUDGET_USD);
  });

  it("honours a stored budget inside the permitted range", () => {
    expect(resolveGuidedCaps({ guided: { budgetUsd: 150 } }).budgetUsd).toBe(150);
  });

  it("lets a stored null turn the budget cap off, unlike every other cap", () => {
    expect(resolveGuidedCaps({ guided: { budgetUsd: null } }).budgetUsd).toBeNull();
  });

  it("falls back to the default budget for a value outside the permitted range", () => {
    expect(resolveGuidedCaps({ guided: { budgetUsd: MIN_GUIDED_BUDGET_USD - 1 } }).budgetUsd).toBe(
      DEFAULT_GUIDED_BUDGET_USD,
    );
    expect(resolveGuidedCaps({ guided: { budgetUsd: MAX_GUIDED_BUDGET_USD + 1 } }).budgetUsd).toBe(
      DEFAULT_GUIDED_BUDGET_USD,
    );
    expect(resolveGuidedCaps({ guided: { budgetUsd: "lots" } }).budgetUsd).toBe(DEFAULT_GUIDED_BUDGET_USD);
  });
});
