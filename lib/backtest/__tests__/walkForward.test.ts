import { describe, expect, it } from "vitest";
import { DEFAULT_WALK_FORWARD, ladderReport, ladderRowsCsv, parseLadderRowsCsv, runLadder, testRung, type LadderRow, type WalkForwardSpec } from "@/lib/backtest/walkForward";

const SPEC: WalkForwardSpec = { ...DEFAULT_WALK_FORWARD, resamples: 300, minTrainCampaigns: 20, minTestCampaigns: 50 };

/** Deterministic rows: `perYear` campaigns for each of `symbols` in 2021-2026, R from `rOf`, refusals from `refusedOf`. */
function rows(
  symbols: number,
  perYear: number,
  rOf: (i: number, year: number) => number,
  refusedOf: (i: number, year: number) => string[],
): LadderRow[] {
  const out: LadderRow[] = [];
  let i = 0;
  for (let year = 2021; year <= 2026; year++) {
    for (let s = 0; s < symbols; s++) {
      for (let k = 0; k < perYear; k++, i++) {
        out.push({ symbol: `S${s}`, date: `${year}-0${1 + (k % 9)}-15`, r: rOf(i, year), refused: new Set(refusedOf(i, year)) });
      }
    }
  }
  return out;
}

describe("testRung", () => {
  it("keeps a rule that refuses the losers in every year", () => {
    // Every third campaign loses 1R, the rest win 0.5R; the rule refuses the losers.
    const data = rows(40, 6, (i) => (i % 3 === 0 ? -1 : 0.5), (i) => (i % 3 === 0 ? ["good"] : []));
    const step = testRung(data, [], "good", SPEC);
    expect(step.folds.every((f) => f.added)).toBe(true);
    expect(step.gain).toBeCloseTo(0.5 - 0, 6);
    expect(step.pPositive).toBe(1);
    expect(step.kept).toBe(true);
  });

  it("drops a rule that refuses at random", () => {
    // R depends on i mod 5, the refusal on i mod 7: independent.
    const data = rows(40, 6, (i) => [-1, -1, 0.5, 1, 2][i % 5], (i) => (i % 7 < 3 ? ["noise"] : []));
    const step = testRung(data, [], "noise", SPEC);
    expect(step.kept).toBe(false);
  });

  it("drops a rule that helped before the test years and hurts after", () => {
    // Before 2022 the refused campaigns lose; from 2022 they are the winners.
    const data = rows(
      40,
      6,
      (i, year) => (i % 2 === 0 ? (year < 2022 ? -1 : 2) : 0),
      (i) => (i % 2 === 0 ? ["stale"] : []),
    );
    const step = testRung(data, [], "stale", SPEC);
    expect(step.folds[0].added).toBe(true); // decided on 2021 alone
    expect(step.gain).toBeLessThan(0);
    expect(step.kept).toBe(false);
  });

  it("never reads the test year in its own decision", () => {
    // The rule only ever helps in 2026; 2026's decision rests on 2021-2025, where it does nothing.
    const data = rows(40, 6, (i, year) => (year === 2026 && i % 2 === 0 ? -3 : 0.1), (i) => (i % 2 === 0 ? ["late"] : []));
    const step = testRung(data, [], "late", SPEC);
    const fold2026 = step.folds.find((f) => f.year === 2026)!;
    expect(fold2026.trainBase).toBeCloseTo(0.1, 9);
    expect(fold2026.trainWith).toBeCloseTo(0.1, 9);
    expect(fold2026.added).toBe(false);
  });
});

describe("runLadder", () => {
  it("climbs in order, testing each rung on the rules kept before it", () => {
    const data = rows(
      40,
      6,
      (i) => (i % 4 === 0 ? -1 : i % 4 === 1 ? -0.5 : 1),
      (i) => [...(i % 4 === 0 ? ["a"] : []), ...(i % 4 === 1 ? ["b"] : []), ...(i % 4 === 0 ? ["dup"] : [])],
    );
    const result = runLadder(data, ["a", "dup", "b"], ["b"], SPEC);
    expect(result.kept).toEqual(["a", "b"]);
    // "dup" refuses only what "a" already removed: nothing left to improve.
    expect(result.steps[1].kept).toBe(false);
    expect(result.references[0].kept).toBe(false);
    expect(result.finalOos.meanR).toBeCloseTo(1, 9);
    expect(ladderReport(result)).toContain("KEEP a");
  });
});

describe("ladder rows CSV", () => {
  it("round-trips", () => {
    const data: LadderRow[] = [
      { symbol: "AAA", date: "2024-03-01", r: 1.25, refused: new Set(["hold:breakaway", "pillar:activity"]) },
      { symbol: "BBB", date: "2025-11-20", r: -1, refused: new Set() },
    ];
    expect(parseLadderRowsCsv(ladderRowsCsv(data))).toEqual(data);
  });

  it("refuses text that is not ladder rows", () => {
    expect(() => parseLadderRowsCsv("label,symbol\nx,y\n")).toThrow();
    expect(() => parseLadderRowsCsv("symbol,date,r,refused\nAAA,2024-3-1,1,\n")).toThrow();
  });
});
