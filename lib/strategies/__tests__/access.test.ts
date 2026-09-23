import { describe, expect, it } from "vitest";
import { isStrategyModeAllowedForPolicy } from "@/lib/strategies/access";

describe("isStrategyModeAllowedForPolicy", () => {
  it("always allows the structural default regardless of the tier's list", () => {
    expect(isStrategyModeAllowedForPolicy({ allowedStrategyModes: [] }, "gann")).toBe(true);
  });

  it("rejects every non-default mode for a tier with an empty list (Novice)", () => {
    const policy = { allowedStrategyModes: [] as const };
    expect(isStrategyModeAllowedForPolicy(policy, "psarSupertrend")).toBe(false);
    expect(isStrategyModeAllowedForPolicy(policy, "vwap")).toBe(false);
  });

  it("allows only the listed modes for a scoped tier (Pro)", () => {
    const policy = { allowedStrategyModes: ["macdMomentum", "rsiReversal", "maCrossover", "vwap"] as const };
    expect(isStrategyModeAllowedForPolicy(policy, "macdMomentum")).toBe(true);
    expect(isStrategyModeAllowedForPolicy(policy, "vwap")).toBe(true);
    expect(isStrategyModeAllowedForPolicy(policy, "psarSupertrend")).toBe(false);
    expect(isStrategyModeAllowedForPolicy(policy, "saraStrat")).toBe(false);
    expect(isStrategyModeAllowedForPolicy(policy, "bollinger")).toBe(false);
  });

  it("allows every mode for 'all' (Expert / Wall Street)", () => {
    const policy = { allowedStrategyModes: "all" as const };
    expect(isStrategyModeAllowedForPolicy(policy, "psarSupertrend")).toBe(true);
    expect(isStrategyModeAllowedForPolicy(policy, "saraStrat")).toBe(true);
    expect(isStrategyModeAllowedForPolicy(policy, "donchian")).toBe(true);
  });
});
