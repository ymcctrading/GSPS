import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Bar, ScanDecision } from "@/lib/types";
import { failedTestAgainst, failedTestInPath, readMultipleTops } from "@/lib/gann/multipleTops";
import { applyFailedTopHold } from "@/lib/scoring/score";
import { FAILED_TOP_CHART_DAYS, readGannExit } from "@/lib/gann/exitRules";
import { ENTRY_CHART_DAYS } from "@/lib/scan/entrySelection";
import { beyondByThreePoints } from "@/lib/gann/pointScale";

// A-LEVELS-04, fork FL3 a: failing to pass an old top is a top.

function bars(closes: number[]): Bar[] {
  const t0 = Date.parse("2026-01-01T00:00:00Z");
  return closes.map((c, i) => ({ t: new Date(t0 + i * 86_400_000).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 }));
}
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
// Two rallies to ~110, the second failing back to 103 (more than the 3 points under).
const doubleTop = [...leg(100, 110, 6), ...leg(110, 102, 5), ...leg(102, 110, 6), ...leg(110, 103, 5)];
// The mirror: two declines to ~90, the second failing back up to 97.
const doubleBottom = [...leg(100, 90, 6), ...leg(90, 98, 5), ...leg(98, 90, 6), ...leg(90, 97, 5)];
const execute = (): ScanDecision => ({ outputState: "Execute", breakdown: [] }) as unknown as ScanDecision;

describe("failedTestAgainst", () => {
  it("names a failed double top against a long and a failed double bottom against a short", () => {
    const tops = readMultipleTops(bars(doubleTop));
    expect(failedTestAgainst(tops, "bullish")).toMatchObject({ kind: "top", tests: 2, state: "failed" });
    expect(failedTestAgainst(tops, "bearish")).toBeNull();
    expect(failedTestAgainst(tops, "none")).toBeNull();
    expect(failedTestAgainst(readMultipleTops(bars(doubleBottom)), "bearish")).toMatchObject({ kind: "bottom", state: "failed" });
  });

  it("is silent while the double top is still being tested", () => {
    const testing = readMultipleTops(bars([...leg(100, 110, 6), ...leg(110, 102, 5), ...leg(102, 110, 6), ...leg(110, 108, 4)]));
    expect(failedTestAgainst(testing, "bullish")).toBeNull();
  });

  it("indexes the latest test's swing extreme in the bars read", () => {
    const b = bars(doubleTop);
    const r = readMultipleTops(b).top!;
    // The second rally peaks on bar 16 (the 6th bar of the third leg).
    expect(r.lastTestIndex).toBe(16);
    expect(b[r.lastTestIndex].c).toBe(110);
  });
});

describe("failedTestInPath (review 11 H1: only a failed test before the first target)", () => {
  const tops = readMultipleTops(bars(doubleTop));
  const L = tops.top!.level;
  const pass = beyondByThreePoints(L, 1);
  it("counts a failed top the trade must pass, by the 3 points, to reach TP1", () => {
    expect(failedTestInPath(tops, "bullish", 104, 120)).toMatchObject({ kind: "top" });
    expect(failedTestInPath(tops, "bullish", 104, pass + 0.01)).not.toBeNull();
    // An entry at the level still has to pass it.
    expect(failedTestInPath(tops, "bullish", L, 120)).not.toBeNull();
  });
  it("leaves a TP1 at the top, or within the 3 points of it: that sells at the top (review 12 M2)", () => {
    expect(failedTestInPath(tops, "bullish", 104, L)).toBeNull();
    expect(failedTestInPath(tops, "bullish", 104, pass)).toBeNull();
    expect(failedTestInPath(tops, "bullish", L + 0.01, 120)).toBeNull();
  });
  it("leaves a long alone whose TP1 is under the failed top, or whose entry is over it", () => {
    expect(failedTestInPath(tops, "bullish", 104, 108)).toBeNull();
    expect(failedTestInPath(tops, "bullish", 112, 120)).toBeNull();
    expect(failedTestInPath(tops, "bullish", 104, null)).toBeNull();
    expect(failedTestInPath(tops, "bullish", null, 115)).toBeNull();
  });
  it("mirrors for a short at a failed bottom", () => {
    const bottoms = readMultipleTops(bars(doubleBottom));
    const B = bottoms.bottom!.level;
    const below = beyondByThreePoints(B, -1);
    expect(failedTestInPath(bottoms, "bearish", 96, 80)).toMatchObject({ kind: "bottom" });
    expect(failedTestInPath(bottoms, "bearish", 96, below - 0.01)).not.toBeNull();
    expect(failedTestInPath(bottoms, "bearish", B, 80)).not.toBeNull();
    expect(failedTestInPath(bottoms, "bearish", 96, below)).toBeNull();
    expect(failedTestInPath(bottoms, "bearish", 96, 92)).toBeNull();
    expect(failedTestInPath(bottoms, "bearish", B - 0.01, 80)).toBeNull();
  });
});

describe("applyFailedTopHold", () => {
  const path = { entry: 104, takeProfit1: 120 };
  it("holds a long Execute to Watch with a failed double top before TP1, and leaves a Watch or a Reject alone", () => {
    const tops = readMultipleTops(bars(doubleTop));
    const held = applyFailedTopHold(execute(), tops, "bullish", path);
    expect(held.outputState).toBe("Watch");
    expect(held.breakdown.at(-1)).toMatchObject({ key: "failedTop", passed: false });
    expect(held.breakdown.at(-1)!.note).toMatch(/double top near 110/);
    expect(applyFailedTopHold(execute(), tops, "bearish", path).outputState).toBe("Execute");
    expect(applyFailedTopHold(execute(), null, "bullish", path).outputState).toBe("Execute");
    expect(applyFailedTopHold(execute(), tops, "bullish", null).outputState).toBe("Execute");
    const watch = { ...execute(), outputState: "Watch" } as ScanDecision;
    expect(applyFailedTopHold(watch, tops, "bullish", path)).toBe(watch);
    const reject = { ...execute(), outputState: "Reject" } as ScanDecision;
    expect(applyFailedTopHold(reject, tops, "bullish", path)).toBe(reject);
  });

  it("does not hold the double-bottom buy at a range's foot, whose target is under the failed top", () => {
    // Tops near 110 twice, a bottom near 100 twice: Gann's buy at the bottom.
    const range = bars([...leg(100, 110, 6), ...leg(110, 100, 6), ...leg(100, 110, 6), ...leg(110, 100, 6), ...leg(100, 101.5, 2)]);
    const tops = readMultipleTops(range);
    expect(failedTestAgainst(tops, "bullish")).not.toBeNull();
    expect(applyFailedTopHold(execute(), tops, "bullish", { entry: 99.7, takeProfit1: 105 }).outputState).toBe("Execute");
  });

  it("holds a short over a failed double bottom", () => {
    const held = applyFailedTopHold(execute(), readMultipleTops(bars(doubleBottom)), "bearish", { entry: 96, takeProfit1: 80 });
    expect(held.outputState).toBe("Watch");
    expect(held.breakdown.at(-1)!.criterion).toMatch(/bottom/);
  });
});

describe("the failed-top exit", () => {
  const b = bars(doubleTop);
  const date = (k: number) => b[k].t.slice(0, 10);
  const pos = (k: number, side: "long" | "short" = "long") => ({
    side,
    entry: b[k].c,
    initialStop: side === "long" ? 80 : 130,
    entryDate: date(k),
    crossedLevel: null,
  });

  it("exits a long when the double top fails after the fill", () => {
    // Bought on the way up to the second test, at its peak, and on the way
    // down before the close 3 points under (review 11 M1: bars 17-19).
    for (const k of [13, 16, 17, 18, 19]) expect(readGannExit(pos(k), b, null).exit).toMatchObject({ reason: "failed_top" });
  });

  it("does not exit a long bought after the double top had already failed", () => {
    // Bar 20 is the first close more than 3 points under the ~110.5 tops.
    expect(readMultipleTops(b.slice(0, 21)).top?.state).toBe("failed");
    expect(readGannExit(pos(21), b, null).exit?.reason).not.toBe("failed_top");
  });

  it("exits a long bought under an excused failed top when a later test fails after the fill (review 12 H1)", () => {
    // The ~110.5 tops failed; a buy at 100 aiming under them; then a third
    // test that fails too.
    const third = bars([...doubleTop, ...leg(103, 100, 3), ...leg(100, 110, 6), ...leg(110, 103, 5)]);
    const p = { side: "long" as const, entry: third[24].c, initialStop: 80, entryDate: third[24].t.slice(0, 10), crossedLevel: null };
    expect(readMultipleTops(third).top).toMatchObject({ tests: 3, state: "failed" });
    expect(readGannExit(p, third, null).exit).toMatchObject({ reason: "failed_top", note: expect.stringMatching(/triple top/) });
    // Without the third test, the failure that stood at entry does not exit it.
    const noThird = bars([...doubleTop, ...leg(103, 100, 3), ...Array.from({ length: 11 }, (_, i) => 100 + (i % 2 ? 0.3 : -0.3))]);
    expect(readGannExit({ ...p, entry: noThird[24].c, entryDate: noThird[24].t.slice(0, 10) }, noThird, null).exit?.reason).not.toBe("failed_top");
  });

  it("exits a long filled on the session the double top failed", () => {
    expect(readGannExit(pos(20), b, null).exit).toMatchObject({ reason: "failed_top" });
  });

  it("exits a short on the mirror at a failed double bottom", () => {
    const d = bars(doubleBottom);
    const short = { side: "short" as const, entry: d[13].c, initialStop: 130, entryDate: d[13].t.slice(0, 10), crossedLevel: null };
    expect(readGannExit(short, d, null).exit).toMatchObject({ reason: "failed_top" });
    expect(readGannExit({ ...short, side: "long", initialStop: 80 }, d, null).exit?.reason).not.toBe("failed_top");
  });

  it("reads the entry chart's 52 weeks", () => {
    expect(FAILED_TOP_CHART_DAYS).toBe(ENTRY_CHART_DAYS);
  });

  it("reads a double top that failed inside the 52 weeks", () => {
    // The failure (bar 20) is 345 days before the last session.
    const flat = Array.from({ length: 345 }, (_, i) => 103 + (i % 2 ? 0.2 : -0.2));
    const recent = bars([...doubleTop, ...flat]);
    const p = { side: "long" as const, entry: 104.7, initialStop: 80, entryDate: recent[3].t.slice(0, 10), crossedLevel: null };
    expect(readGannExit(p, recent, null).exit).toMatchObject({ reason: "failed_top" });
  });

  it("does not read a double top whose first test is just outside the 52 weeks", () => {
    // The first test (bar 6) is 390 days back; the second (bar 16) is inside.
    const flat = Array.from({ length: 375 }, (_, i) => 103 + (i % 2 ? 0.2 : -0.2));
    const edge = bars([...doubleTop, ...flat]);
    const p = { side: "long" as const, entry: 103, initialStop: 80, entryDate: edge[3].t.slice(0, 10), crossedLevel: null };
    expect(readGannExit(p, edge, null).exit?.reason).not.toBe("failed_top");
  });

  it("does not read a double top older than the 52 weeks", () => {
    // The same failed double top, then a long flat year before the fill.
    const flat = Array.from({ length: 400 }, (_, i) => 103 + (i % 2 ? 0.2 : -0.2));
    const old = bars([...doubleTop, ...flat]);
    const p = { side: "long" as const, entry: 103, initialStop: 80, entryDate: old[3].t.slice(0, 10), crossedLevel: null };
    expect(readGannExit(p, old, null).exit?.reason).not.toBe("failed_top");
  });
});

describe("the failed-top hold is wired on every surface", () => {
  const src = (p: string) => readFileSync(p, "utf8");
  it("reads the 52-week entry chart on the live scan and holds the verdict", () => {
    const s = src("lib/scanTicker.ts");
    expect(s).toMatch(/const failedTops = readMultipleTops\(charts\.daily\)/);
    expect(s).toMatch(/applyFailedTopHold\(applyDistributionBreakdownHold\(/);
    expect(s).toMatch(/distributionStanding, scoreDirection\), failedTops, scoreDirection, levels\)/);
  });
  it("holds the verdict and skips the entry in the replay", () => {
    const s = src("lib/backtest/replay.ts");
    expect(s).toMatch(/applyFailedTopHold\(applyDistributionBreakdownHold\(/);
    expect(s).toMatch(/context\.disclosedRules\.multipleTops, gannTrigger\.direction, levels\)/);
    expect(s).toMatch(/\n\s+if \(failedTestInPath\(arm\.context\.disclosedRules\.multipleTops, trigger\.direction, path\?\.entry, path\?\.takeProfit1\)\) continue;/);
    expect(s).toMatch(/sessionPlanPaths\.set\(planKey, plan \? \{ entry: plan\.entry, takeProfit1: plan\.takeProfit1 \} : null\)/);
  });
});

describe("the excused failed tops are measured (review 12 M3)", () => {
  it("marks a failed top beyond TP1, and not one in the path or with no TP1", async () => {
    const { contextFactorsFor } = await import("@/lib/gann/contextFactors");
    const { readDisclosedRules } = await import("@/lib/gann/disclosedRules");
    const b = bars(doubleTop);
    const ctx = { ...readDisclosedRules(b, 103, { sharesOutstanding: null, inception: null, monthly: [] }, new Date("2026-01-24T15:00:00Z")), multipleTops: readMultipleTops(b) };
    expect(contextFactorsFor(ctx, "bullish", 104, 108).failedTopBeyondFirstTarget).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", 104, 120).failedTopBeyondFirstTarget).toBe(false);
    expect(contextFactorsFor(ctx, "bullish", 104).failedTopBeyondFirstTarget).toBeUndefined();
    expect(contextFactorsFor(ctx, "bearish", 104, 90).failedTopBeyondFirstTarget).toBeUndefined();
  });
  it("is passed the session plan's TP1 in the replay", () => {
    const s = readFileSync("lib/backtest/replay.ts", "utf8");
    expect(s.match(/contextFactorsFor\(arm\.context\.disclosedRules, trigger\.direction, entry, path\?\.takeProfit1\)/g)?.length).toBe(2);
  });
});
