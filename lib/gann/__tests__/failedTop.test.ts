import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Bar, ScanDecision } from "@/lib/types";
import { failedTestAgainst, readMultipleTops } from "@/lib/gann/multipleTops";
import { applyFailedTopHold } from "@/lib/scoring/score";
import { FAILED_TOP_CHART_DAYS, readGannExit } from "@/lib/gann/exitRules";
import { ENTRY_CHART_DAYS } from "@/lib/scan/entrySelection";

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

describe("applyFailedTopHold", () => {
  it("holds a long Execute to Watch under a failed double top, and leaves a Watch alone", () => {
    const tops = readMultipleTops(bars(doubleTop));
    const held = applyFailedTopHold(execute(), tops, "bullish");
    expect(held.outputState).toBe("Watch");
    expect(held.breakdown.at(-1)).toMatchObject({ key: "failedTop", passed: false });
    expect(held.breakdown.at(-1)!.note).toMatch(/double top near 110/);
    expect(applyFailedTopHold(execute(), tops, "bearish").outputState).toBe("Execute");
    expect(applyFailedTopHold(execute(), null, "bullish").outputState).toBe("Execute");
    const watch = { ...execute(), outputState: "Watch" } as ScanDecision;
    expect(applyFailedTopHold(watch, tops, "bullish")).toBe(watch);
  });

  it("holds a short over a failed double bottom", () => {
    const held = applyFailedTopHold(execute(), readMultipleTops(bars(doubleBottom)), "bearish");
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
    // Bought on the way up to the second test.
    expect(readGannExit(pos(13), b, null).exit).toMatchObject({ reason: "failed_top" });
  });

  it("does not exit a long bought after the failed top had already printed", () => {
    expect(readGannExit(pos(19), b, null).exit?.reason).not.toBe("failed_top");
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
    expect(s).toMatch(/distributionStanding, scoreDirection\), failedTops, scoreDirection\)/);
  });
  it("holds the verdict and skips the entry in the replay", () => {
    const s = src("lib/backtest/replay.ts");
    expect(s).toMatch(/applyFailedTopHold\(applyDistributionBreakdownHold\(/);
    expect(s).toMatch(/context\.disclosedRules\.multipleTops, gannTrigger\.direction\)/);
    expect(s).toMatch(/failedTestAgainst\(arm\.context\.disclosedRules\.multipleTops, trigger\.direction\)\) continue/);
  });
});
