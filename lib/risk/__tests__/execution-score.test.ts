import { describe, expect, it } from "vitest";
import { computeExecutionScore } from "@/lib/risk/execution-score";

describe("computeExecutionScore", () => {
  it("scores 100 when every metric is perfect", () => {
    const s = computeExecutionScore({
      stopDiscipline: 1,
      positionSizing: 1,
      entryDiscipline: 1,
      exitPlanAdherence: 1,
      frequencyDiscipline: 1,
      correlationDiscipline: 1,
      journalCompletion: 1,
    });
    expect(s.score).toBeCloseTo(100, 6);
  });

  it("scores 0 when every metric fails", () => {
    const s = computeExecutionScore({
      stopDiscipline: 0,
      positionSizing: 0,
      entryDiscipline: 0,
      exitPlanAdherence: 0,
      frequencyDiscipline: 0,
      correlationDiscipline: 0,
      journalCompletion: 0,
    });
    expect(s.score).toBe(0);
  });

  it("weights stop discipline heaviest at 25%", () => {
    const s = computeExecutionScore({
      stopDiscipline: 1,
      positionSizing: 0,
      entryDiscipline: 0,
      exitPlanAdherence: 0,
      frequencyDiscipline: 0,
      correlationDiscipline: 0,
      journalCompletion: 0,
    });
    expect(s.score).toBeCloseTo(25, 6);
    expect(s.breakdown.stopDiscipline).toBeCloseTo(25, 6);
  });

  it("clamps out-of-range inputs rather than producing a score outside 0-100", () => {
    const s = computeExecutionScore({
      stopDiscipline: 2, // invalid, clamped to 1
      positionSizing: -1, // invalid, clamped to 0
      entryDiscipline: 1,
      exitPlanAdherence: 1,
      frequencyDiscipline: 1,
      correlationDiscipline: 1,
      journalCompletion: 1,
    });
    expect(s.score).toBeLessThanOrEqual(100);
    expect(s.score).toBeGreaterThanOrEqual(0);
  });
});
