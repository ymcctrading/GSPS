import { describe, expect, it } from "vitest";
import { computeAnnualCycle, EARLY_MONTH_DAY } from "../annualCycle";

describe("computeAnnualCycle", () => {
  it("is active on the first day of a named window month", () => {
    const reading = computeAnnualCycle(new Date("2026-02-01T12:00:00Z"), 0);
    expect(reading.active).toBe(true);
    expect(reading.window).toBe("2026-02");
  });

  it(`is active through day ${EARLY_MONTH_DAY} of a named window month`, () => {
    const reading = computeAnnualCycle(new Date(`2026-11-${EARLY_MONTH_DAY}T00:00:00Z`), 0);
    expect(reading.active).toBe(true);
    expect(reading.window).toBe("2026-11");
  });

  it("is not active mid-month, outside the tolerance window", () => {
    const reading = computeAnnualCycle(new Date("2026-02-20T00:00:00Z"), 0);
    expect(reading.active).toBe(false);
    expect(reading.window).toBeNull();
  });

  it("is not active in a month the annual cycle does not name", () => {
    const reading = computeAnnualCycle(new Date("2026-01-05T00:00:00Z"), 0);
    expect(reading.active).toBe(false);
  });

  it("extends each window by windowDays on either side", () => {
    const justBefore = new Date(`2026-08-01T00:00:00Z`);
    justBefore.setUTCDate(justBefore.getUTCDate() - 2);
    const reading = computeAnnualCycle(justBefore, 3);
    expect(reading.active).toBe(true);
    expect(reading.window).toBe("2026-08");
  });

  it("always reports a nearest window even when inactive", () => {
    // Equidistant-ish between March's window (ends Mar 10) and May's (starts
    // May 1) — April 20 is 41 days from the former and 11 from the latter, so
    // May is unambiguously nearest.
    const reading = computeAnnualCycle(new Date("2026-04-20T00:00:00Z"), 0);
    expect(reading.nearestWindowStart).toBe("2026-05-01");
  });

  it("looks back into the prior year's December window from early January", () => {
    // December is a cycle month (see CYCLE_MONTHS); a window near a January
    // date has to reach back into the *previous* calendar year's December,
    // not just the current year's (which is 11 months in the future).
    const reading = computeAnnualCycle(new Date("2026-01-01T00:00:00Z"), 25);
    expect(reading.active).toBe(true);
    expect(reading.window).toBe("2025-12");
  });
});
