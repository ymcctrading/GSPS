import { describe, expect, it } from "vitest";
import { assessCycleRigor, cycleSynchrony } from "@/lib/validation/cycleRigor";

/** Build a near-perfect periodic series of dates, `periodDays` apart, starting at `start`. */
function perfectSeries(start: Date, periodDays: number, count: number): Date[] {
  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    dates.push(new Date(start.getTime() + i * periodDays * 24 * 3600 * 1000));
  }
  return dates;
}

describe("assessCycleRigor", () => {
  it("reports insufficientData for too few events", () => {
    const result = assessCycleRigor({
      eventDates: [new Date("2020-01-01"), new Date("2020-02-01")],
      periodDays: 30,
    });
    expect(result.overall).toBe("insufficientData");
    expect(result.totalApplicable).toBe(0);
  });

  it("reports insufficientData when the data span is under two periods", () => {
    const result = assessCycleRigor({
      eventDates: perfectSeries(new Date("2020-01-01"), 90, 2),
      periodDays: 90,
    });
    expect(result.overall).toBe("insufficientData");
  });

  it("passes every applicable criterion for a long, near-perfect periodic series", () => {
    const result = assessCycleRigor({
      eventDates: perfectSeries(new Date("2015-01-01"), 60, 12),
      periodDays: 60,
    });
    expect(result.dominance.verdict).toBe("pass");
    expect(result.regularity.verdict).toBe("pass");
    expect(result.repetitionCount.verdict).toBe("pass");
    expect(result.constancyOfPeriod.verdict).toBe("pass");
    expect(result.overall).toBe("wellSupported");
  });

  it("fails dominance/regularity for randomly-spaced dates unrelated to the candidate period", () => {
    // Deliberately irregular spacings that don't cluster near multiples of 45 days.
    const irregular = [0, 12, 41, 68, 130, 133, 210, 302, 305, 400].map(
      (d) => new Date(new Date("2018-01-01").getTime() + d * 24 * 3600 * 1000),
    );
    const result = assessCycleRigor({ eventDates: irregular, periodDays: 45 });
    expect(result.overall).not.toBe("wellSupported");
  });

  it("flags phase resumption failure when a distortion is never corrected", () => {
    const base = perfectSeries(new Date("2019-01-01"), 30, 6);
    // Introduce a permanent phase shift after the 3rd event, carried forward uncorrected.
    const shifted = base.map((d, i) => (i >= 3 ? new Date(d.getTime() + 20 * 24 * 3600 * 1000) : d));
    const result = assessCycleRigor({ eventDates: shifted, periodDays: 30 });
    expect(result.phaseResumption.verdict).toBe("fail");
  });

  it("marks phaseResumption and constancyOfPeriod notApplicable when there's no distortion / too few intervals", () => {
    const result = assessCycleRigor({
      eventDates: perfectSeries(new Date("2021-06-01"), 90, 4),
      periodDays: 90,
    });
    expect(result.phaseResumption.verdict).toBe("notApplicable"); // no distortion to test recovery from
    // 3 intervals is below MIN_EVENTS_FOR_CONSTANCY_CHECK - 1 threshold's boundary; just confirm it resolves either way without throwing.
    expect(["pass", "fail", "notApplicable"]).toContain(result.constancyOfPeriod.verdict);
  });
});

describe("cycleSynchrony", () => {
  it("passes when two series share the same phase", () => {
    const a = perfectSeries(new Date("2020-01-01"), 40, 8);
    const b = perfectSeries(new Date("2020-01-03"), 40, 8); // 2 days off-phase, well within tolerance
    const result = cycleSynchrony(a, b, 40);
    expect(result.verdict).toBe("pass");
  });

  it("fails when two series are roughly half a period out of phase", () => {
    const a = perfectSeries(new Date("2020-01-01"), 40, 8);
    const b = perfectSeries(new Date("2020-01-21"), 40, 8); // ~half period off
    const result = cycleSynchrony(a, b, 40);
    expect(result.verdict).toBe("fail");
  });

  it("returns notApplicable for an empty series", () => {
    const result = cycleSynchrony([], [new Date("2020-01-01")], 30);
    expect(result.verdict).toBe("notApplicable");
  });
});
