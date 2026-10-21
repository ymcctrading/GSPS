import { describe, expect, it } from "vitest";
import { checkPositionLimits } from "@/lib/risk/position-limits";

describe("checkPositionLimits", () => {
  const base = {
    equity: 450,
    newPositionNotionalUsd: 90, // 20%
    currentlyDeployedUsd: 0,
    currentOpenRiskUsd: 0,
    newPositionRiskUsd: 4.5, // 1%
    openCorrelatedGroupsExcludingThis: 0,
    candidateJoinsExistingGroup: false,
    maxCorrelatedRiskGroups: 1 as const,
    percentRiskCeilings: true,
  };

  it("passes a well-sized single position with no correlated exposure", () => {
    expect(checkPositionLimits(base).ok).toBe(true);
  });

  it("flags a single position over the 25% allocation ceiling", () => {
    const v = checkPositionLimits({ ...base, newPositionNotionalUsd: 150 }); // ~33%
    expect(v.ok).toBe(false);
    expect(v.violations.some((m) => m.includes("Single-position"))).toBe(true);
  });

  it("flags aggregate deployed allocation over 65%", () => {
    const v = checkPositionLimits({ ...base, currentlyDeployedUsd: 250, newPositionNotionalUsd: 60 });
    expect(v.ok).toBe(false);
    expect(v.violations.some((m) => m.includes("Aggregate"))).toBe(true);
  });

  it("flags total planned open risk over 2.0%", () => {
    const v = checkPositionLimits({ ...base, currentOpenRiskUsd: 5, newPositionRiskUsd: 5 });
    expect(v.ok).toBe(false);
    expect(v.violations.some((m) => m.includes("open risk"))).toBe(true);
  });

  it("holds an account above Novice to the capital rules alone, not the percent ceilings", () => {
    const v = checkPositionLimits({
      ...base,
      newPositionNotionalUsd: 150, // ~33%
      currentlyDeployedUsd: 250,
      currentOpenRiskUsd: 5,
      newPositionRiskUsd: 5,
      maxCorrelatedRiskGroups: "unlimited",
      percentRiskCeilings: false,
    });
    expect(v).toEqual({ ok: true, violations: [] });
  });

  it("blocks a second correlated risk group at low equity", () => {
    const v = checkPositionLimits({ ...base, openCorrelatedGroupsExcludingThis: 1 });
    expect(v.ok).toBe(false);
    expect(v.violations.some((m) => m.includes("correlated"))).toBe(true);
  });

  it("leaves the group count uncapped for tiers above Novice", () => {
    const v = checkPositionLimits({
      ...base,
      openCorrelatedGroupsExcludingThis: 5,
      maxCorrelatedRiskGroups: "unlimited",
    });
    expect(v.violations.some((m) => m.includes("correlated"))).toBe(false);
  });

  it("allows adding to an already-open correlated group without opening a new one", () => {
    const v = checkPositionLimits({
      ...base,
      openCorrelatedGroupsExcludingThis: 1,
      candidateJoinsExistingGroup: true,
    });
    expect(v.violations.some((m) => m.includes("correlated"))).toBe(false);
  });
});
