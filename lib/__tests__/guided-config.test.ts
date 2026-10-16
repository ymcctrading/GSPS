/**
 * Caps are read from a user-writable JSON column, so `resolveGuidedCaps` is a
 * trust boundary: a value it accepts is a limit the mode will honour on real
 * (paper) money.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_GUIDED_CAPS,
  DEFAULT_GUIDED_POLICY,
  MAX_RISK_PCT,
  MIN_RISK_PCT,
  resolveGuidedCaps,
} from "@/lib/guided/config";

describe("resolveGuidedCaps", () => {
  it("ships conservative defaults when nothing is stored", () => {
    expect(resolveGuidedCaps(null)).toEqual(DEFAULT_GUIDED_CAPS);
    expect(resolveGuidedCaps({})).toEqual(DEFAULT_GUIDED_CAPS);
  });

  it("honours a stored value inside the permitted range", () => {
    expect(resolveGuidedCaps({ guided: { riskPct: 0.5 } })).toEqual({ riskPct: 0.5 });
  });

  it("falls back to the default for a value outside the permitted range", () => {
    expect(resolveGuidedCaps({ guided: { riskPct: MAX_RISK_PCT + 1 } }).riskPct).toBe(
      DEFAULT_GUIDED_CAPS.riskPct,
    );
    expect(resolveGuidedCaps({ guided: { riskPct: MIN_RISK_PCT - 0.1 } }).riskPct).toBe(
      DEFAULT_GUIDED_CAPS.riskPct,
    );
  });

  it("falls back rather than failing on junk", () => {
    expect(resolveGuidedCaps({ guided: { riskPct: "lots" } })).toEqual(
      DEFAULT_GUIDED_CAPS,
    );
    expect(resolveGuidedCaps("not an object")).toEqual(DEFAULT_GUIDED_CAPS);
  });

  it("never lets the risk cap be disabled by writing zero", () => {
    expect(resolveGuidedCaps({ guided: { riskPct: 0 } })).toEqual(DEFAULT_GUIDED_CAPS);
  });

  it("ignores the retired trade-count, deployed and budget keys a stored row may still carry (Q12)", () => {
    expect(resolveGuidedCaps({ guided: { maxTradesPerDay: 1, maxDeployedPct: 5, budgetUsd: 50 } })).toEqual(DEFAULT_GUIDED_CAPS);
  });

  it("honors a policy_values-resolved override instead of the code default", () => {
    const looser = { ...DEFAULT_GUIDED_POLICY, defaultRiskPct: 1.5, maxRiskPct: 3 };
    const caps = resolveGuidedCaps(null, looser);
    expect(caps.riskPct).toBe(1.5);
    // A stored value now clamps against the overridden ceiling, not the code default.
    expect(resolveGuidedCaps({ guided: { riskPct: 2.5 } }, looser).riskPct).toBe(2.5);
  });
});
