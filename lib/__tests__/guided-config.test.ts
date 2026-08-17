/**
 * Caps are read from a user-writable JSON column, so `resolveGuidedCaps` is a
 * trust boundary: a value it accepts is a limit the mode will honour on real
 * (paper) money.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_GUIDED_CAPS,
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
});
