import { describe, expect, it } from "vitest";
import {
  assertFeature,
  FeatureGateError,
  hasFeature,
  minimumTierFor,
} from "./entitlements";

describe("entitlements", () => {
  it("keeps live execution + manual orders free (Standard)", () => {
    expect(hasFeature("STANDARD", "live_execution")).toBe(true);
    expect(hasFeature("STANDARD", "manual_order_suite")).toBe(true);
  });

  it("gates the mean-reversion scanner behind Investor Mode", () => {
    expect(hasFeature("STANDARD", "mean_reversion_scanner")).toBe(false);
    expect(hasFeature("INVESTOR_MODE", "mean_reversion_scanner")).toBe(true);
    expect(minimumTierFor("mean_reversion_scanner")).toBe("INVESTOR_MODE");
  });

  it("gates autonomous automation behind System Mastery", () => {
    expect(hasFeature("INVESTOR_MODE", "autonomous_portfolio_manager")).toBe(
      false,
    );
    expect(hasFeature("SYSTEM_MASTERY", "autonomous_portfolio_manager")).toBe(
      true,
    );
  });

  it("Practice tier cannot execute live", () => {
    expect(hasFeature("PRACTICE", "live_execution")).toBe(false);
    expect(hasFeature("PRACTICE", "paper_trading")).toBe(true);
  });

  it("assertFeature throws a FeatureGateError with the required tier", () => {
    try {
      assertFeature("STANDARD", "oscillators");
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(FeatureGateError);
      expect((e as FeatureGateError).requiredTier).toBe("INVESTOR_MODE");
    }
  });
});
