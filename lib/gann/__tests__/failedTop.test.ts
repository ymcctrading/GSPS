import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Bar, ScanDecision } from "@/lib/types";
import { failedTestAgainst, failedTestInPath, readMultipleTops } from "@/lib/gann/multipleTops";
import { applyFailedTopHold } from "@/lib/scoring/score";
import { FAILED_TOP_CHART_DAYS, failedTopWindow, readGannExit } from "@/lib/gann/exitRules";
import { ENTRY_CHART_DAYS } from "@/lib/scan/entrySelection";
import { beyondByThreePoints } from "@/lib/gann/pointScale";

// A-LEVELS-04, fork FL3 a: failing to pass an old top is a top.

function bars(closes: number[]): Bar[] {
  const t0 = Date.parse("2026-01-01T00:00:00Z");
  return closes.map((c, i) => ({ t: new Date(t0 + i * 86_400_000).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 }));
}
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
// Two rallies to ~110, the second failing back to 103 (more than the 3 points under).
const doubleTop = [...leg(90, 110, 6), ...leg(110, 102, 5), ...leg(102, 110, 6), ...leg(110, 103, 5)];
// The mirror: two declines to ~90, the second failing back up to 97.
const doubleBottom = [...leg(110, 90, 6), ...leg(90, 98, 5), ...leg(98, 90, 6), ...leg(90, 97, 5)];
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

  it("stays failed on a rally back under the top, until a close passes it by the 3 points (owner card)", () => {
    // Back up to 108, inside the 3 points under ~110.5: still under the top.
    const back = [...doubleTop, ...leg(103, 108, 3)];
    expect(failedTestAgainst(readMultipleTops(bars(back)), "bullish")).toMatchObject({ state: "failed" });
    // A close over ~115.8 passes it.
    expect(failedTestAgainst(readMultipleTops(bars([...back, 116.5])), "bullish")).toBeNull();
    // Still rising, over the top but short of the 3 points: still failed.
    expect(failedTestAgainst(readMultipleTops(bars([...doubleTop, ...leg(103, 113, 4)])), "bullish")).toMatchObject({ state: "failed" });
    expect(failedTestAgainst(readMultipleTops(bars([...doubleBottom, ...leg(97, 87, 4)])), "bearish")).toMatchObject({ state: "failed" });
    // Still rising, past it by the 3 points: crossed, not failed.
    expect(readMultipleTops(bars([...doubleTop, ...leg(103, 117, 5)])).top).toMatchObject({ state: "crossed" });
    expect(readMultipleTops(bars([...doubleBottom, ...leg(97, 83, 5)])).bottom).toMatchObject({ state: "crossed" });
    // Passed some sessions ago and back under it: no longer failed.
    const passedThenBack = [...back, 116.5, ...leg(116.5, 109, 6)];
    expect(failedTestAgainst(readMultipleTops(bars(passedThenBack)), "bullish")).toBeNull();
    // Over the top but not by the 3 points is a third test, a new swing:
    // being tested until it too falls back 3 points under.
    const third = [...back, 112, ...leg(112, 108.5, 6)];
    expect(readMultipleTops(bars(third)).top).toMatchObject({ tests: 3, state: "testing" });
    expect(failedTestAgainst(readMultipleTops(bars([...third, 104])), "bullish")).toMatchObject({ tests: 3 });
    // The mirror: a decline back toward a held double bottom.
    const down = [...doubleBottom, ...leg(97, 92, 3)];
    expect(failedTestAgainst(readMultipleTops(bars(down)), "bearish")).toMatchObject({ state: "failed" });
    expect(failedTestAgainst(readMultipleTops(bars([...down, 84])), "bearish")).toBeNull();
  });

  it("reads a failed top even while an older double top lies nearer to price (review 13 H1)", () => {
    // A double top near 96, then one near 110 that failed back to 97.
    const pre = [...leg(88, 96, 5), ...leg(96, 91, 4), ...leg(91, 96, 4), ...leg(96, 92, 4), ...leg(92, 110, 8), ...leg(110, 102, 5), ...leg(102, 110, 6), ...leg(110, 97, 8)];
    const r = readMultipleTops(bars(pre));
    expect(r.top).toMatchObject({ state: "failed" });
    expect(r.top!.level).toBeGreaterThan(105);
    expect(failedTestInPath(r, "bullish", 97, 120)).not.toBeNull();
    // A long bought there anyway does not exit on that same failure later.
    const post = bars([...pre, ...leg(97, 104, 5)]);
    const p = { side: "long" as const, entry: 97, initialStop: 85, entryDate: post[pre.length].t.slice(0, 10), crossedLevel: null };
    expect(readGannExit(p, post, null).exit?.reason).not.toBe("failed_top");
  });

  it("forgets an old failed top once a newer swing top stands apart from it (review 14 M)", () => {
    // The ~110.5 double top failed; a later rally tops at ~104.5, outside its band.
    const newer = bars([...doubleTop, ...leg(103, 100, 3), ...leg(100, 104, 4), ...leg(104, 101, 4)]);
    expect(failedTestAgainst(readMultipleTops(newer), "bullish")).toBeNull();
  });

  it("judges the cluster the latest top joined, not the newest cluster formed", () => {
    // Tops near 96 twice, then near 110.5 twice, then a third test near 96 that fails.
    const closes = [...leg(88, 96, 5), ...leg(96, 91, 4), ...leg(91, 96, 4), ...leg(96, 92, 4), ...leg(92, 110, 8), ...leg(110, 102, 5), ...leg(102, 110, 6), ...leg(110, 90, 10), ...leg(90, 96, 5), ...leg(96, 89, 6)];
    const r = readMultipleTops(bars(closes));
    expect(r.top).toMatchObject({ state: "failed", tests: 3 });
    expect(r.top!.level).toBeLessThan(100);
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
  it("holds a crossing entry until a daily close passes the failed top: an intraday crossing is not the pass", () => {
    // Gann: "safest at 3" (W006 Rule 3) and "wait for a close beyond it"
    // (Master Course rules 4-5). The function takes no crossing level at all.
    expect(failedTestInPath.length).toBe(4);
    expect(failedTestInPath(tops, "bullish", L + 1, 120)).not.toBeNull();
    // The daily close past the line lifts the failure in the reading itself.
    const passed = readMultipleTops(bars([...doubleTop, ...leg(103, pass + 1.5, 6)]));
    expect(failedTestAgainst(passed, "bullish")).toBeNull();
    expect(failedTestInPath(passed, "bullish", L + 1, 120)).toBeNull();
  });

  it("is not lifted by a session that trades past the line and closes back under it (review 19 M1)", () => {
    // Master Course rules 4-5: an intraday poke often reverses by the close.
    const poke = (close: number, extreme: number, kind: "top" | "bottom"): Bar[] => {
      const b = bars(kind === "top" ? [...doubleTop, ...leg(103, 108, 3)] : [...doubleBottom, ...leg(97, 92, 3)]);
      const last = b[b.length - 1];
      const t = new Date(Date.parse(last.t) + 86_400_000).toISOString();
      return [...b, kind === "top" ? { t, o: close, h: extreme, l: close - 0.5, c: close, v: 1e6 } : { t, o: close, h: close + 0.5, l: extreme, c: close, v: 1e6 }];
    };
    const topLine = beyondByThreePoints(L, 1);
    expect(failedTestAgainst(readMultipleTops(poke(108, topLine + 2, "top")), "bullish")).toMatchObject({ state: "failed" });
    const B = readMultipleTops(bars(doubleBottom)).bottom!.level;
    const bottomLine = beyondByThreePoints(B, -1);
    expect(failedTestAgainst(readMultipleTops(poke(92, bottomLine - 2, "bottom")), "bearish")).toMatchObject({ state: "failed" });
  });

  it("leaves a TP1 at the top, or within the 3 points of it: that sells at the top (review 12 M2)", () => {
    expect(failedTestInPath(tops, "bullish", 104, L)).toBeNull();
    expect(failedTestInPath(tops, "bullish", 104, pass)).toBeNull();
    // Over the top but short of passing it is still under it (review 13 L2).
    expect(failedTestInPath(tops, "bullish", L + 1, 120)).not.toBeNull();
    expect(failedTestInPath(tops, "bullish", pass, 120)).toBeNull();
  });
  it("leaves a long alone whose TP1 is under the failed top, or whose entry is past it", () => {
    expect(failedTestInPath(tops, "bullish", 104, 108)).toBeNull();
    expect(failedTestInPath(tops, "bullish", 116, 125)).toBeNull();
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
    expect(failedTestInPath(bottoms, "bearish", B - 1, 80)).not.toBeNull();
    expect(failedTestInPath(bottoms, "bearish", below, 80)).toBeNull();
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

  it("reads the 52 weeks before the next session: the fill session at entry, the next weekday today", () => {
    // Daily bars from Thursday 2026-01-01, weekends included.
    const b = bars(Array.from({ length: 400 }, () => 100));
    // Bars before index 380 (2027-01-16, a Saturday): the fill session is that bar.
    expect(failedTopWindow(b, 380)[0].t.slice(0, 10)).toBe("2026-01-17");
    // Today: the last bar is Friday 2027-01-15 at index 379, so the next
    // weekday is Monday 2027-01-18 and the window starts 364 days before it.
    const today = b.slice(0, 380);
    expect(today.at(-1)!.t.slice(0, 10)).toBe("2027-01-15");
    expect(failedTopWindow(today, today.length)[0].t.slice(0, 10)).toBe("2026-01-19");
    expect(failedTopWindow(today, today.length).at(-1)).toBe(today.at(-1));
  });

  it("matches the test standing at entry by its session, not its place in the window (review 13 L1)", () => {
    // A year of quiet before the double top, so the window's start moves
    // between the fill and today; the long is bought under the failed top.
    const pre = Array.from({ length: 330 }, (_, i) => 90 + (i % 2 ? 0.2 : -0.2));
    const after = Array.from({ length: 60 }, (_, i) => 101 + (i % 2 ? 0.2 : -0.2));
    const b = bars([...pre, ...doubleTop, ...after]);
    const k = pre.length + doubleTop.length;
    expect(readMultipleTops(b.slice(0, k)).top).toMatchObject({ state: "failed" });
    const p = { side: "long" as const, entry: b[k].c, initialStop: 80, entryDate: b[k].t.slice(0, 10), crossedLevel: null };
    expect(readGannExit(p, b, null).exit?.reason).not.toBe("failed_top");
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
    expect(s).toMatch(/distributionStanding, scoreDirection\), failedTops, scoreDirection, levels\),/);
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
    expect(s.match(/contextFactorsFor\(arm\.context\.disclosedRules, trigger\.direction, entry, path\?\.takeProfit1[,)]/g)?.length).toBe(2);
  });
});

describe("a top passed and then failed back under is a failed top", () => {
  // Since Q22 (2026-10-16) the pass line is 3 points over the highest test, so
  // a close past it makes a swing top of its own, outside the cluster's band:
  // a failed top can never have been passed since its latest test. Checked on
  // the reviewers' seeded walks (seed s*977+20).
  it("never reads failed after a close passed the line, on seeded random walks", () => {
    let failed = 0;
    for (let s0 = 1; s0 < 30; s0++) {
      let seed = s0 * 977 + 20;
      const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
      const c: number[] = [20];
      for (let i = 1; i < 300; i++) c.push(c[i - 1] * Math.exp(0.025 * gauss()));
      const t0 = Date.parse("2025-01-01T00:00:00Z");
      const b: Bar[] = c.map((x, i) => {
        const o = c[i - 1] ?? x;
        return { t: new Date(t0 + i * 86400000).toISOString(), o, h: Math.max(o, x) * (1 + 0.006 * rnd()), l: Math.min(o, x) * (1 - 0.006 * rnd()), c: x, v: 1e6 };
      });
      for (let end = 40; end <= 300; end += 5) {
        const top = readMultipleTops(b.slice(0, end)).top;
        if (top?.state !== "failed") continue;
        failed++;
        expect(b.slice(top.lastTestIndex + 1, end).some((x) => x.c > beyondByThreePoints(top.level, 1))).toBe(false);
      }
    }
    expect(failed).toBeGreaterThan(100);
  });
});

describe("a close exactly on the 3-point line (review 18 L1)", () => {
  const t0 = Date.parse("2026-01-01T00:00:00Z");
  const mk = (cs: number[]): Bar[] => cs.map((c, i) => ({ t: new Date(t0 + i * 86_400_000).toISOString(), o: c, h: c, l: c, c, v: 1e6 }));
  const leg = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => Math.round((a + ((b - a) * (i + 1)) / n) * 100) / 100);
  const base = [...leg(8, 10, 6), ...leg(10, 9.2, 5), ...leg(9.2, 10, 6), ...leg(10, 9.3, 4)];
  it("reads failed only once a close is more than 3 points under the top", () => {
    const line = beyondByThreePoints(10, -1);
    expect(line).toBe(8.8);
    expect(readMultipleTops(mk([...base, line])).top?.state).not.toBe("failed");
    expect(readMultipleTops(mk([...base, 8.79])).top).toMatchObject({ level: 10, state: "failed" });
  });
});

describe("A-LEVELS-04: a failed top passes only 3 points over its highest test (Q22, 2026-10-16)", () => {
  // Tests at ~110.5 and ~113.5, then back to 103.
  const uneven = [...leg(90, 110, 6), ...leg(110, 102, 5), ...leg(102, 113, 6), ...leg(113, 103, 5)];
  const unevenBottom = [...leg(110, 90, 6), ...leg(90, 98, 5), ...leg(98, 87, 6), ...leg(87, 97, 5)];

  it("reads the level at the highest test, and the lowest for a bottom", () => {
    expect(readMultipleTops(bars(uneven)).top).toMatchObject({ tests: 2, state: "failed", level: 113.5 });
    expect(readMultipleTops(bars(unevenBottom)).bottom).toMatchObject({ tests: 2, state: "failed", level: 86.5 });
  });

  it("stays failed on a close past the tests' mean but short of the highest test's line", () => {
    const line = beyondByThreePoints(113.5, 1);
    const overMean = (beyondByThreePoints(112, 1) + line) / 2;
    expect(failedTestAgainst(readMultipleTops(bars([...uneven, overMean])), "bullish")).toMatchObject({ state: "failed" });
    expect(failedTestAgainst(readMultipleTops(bars([...uneven, line + 0.5])), "bullish")).toBeNull();
    const bottomLine = beyondByThreePoints(86.5, -1);
    const underMean = (beyondByThreePoints(88, -1) + bottomLine) / 2;
    expect(failedTestAgainst(readMultipleTops(bars([...unevenBottom, underMean])), "bearish")).toMatchObject({ state: "failed" });
    expect(failedTestAgainst(readMultipleTops(bars([...unevenBottom, bottomLine - 0.5])), "bearish")).toBeNull();
  });
});

describe("C-LEVELS-06: a double top is crossed only by a close 3 points over it (review 22)", () => {
  const testing = [...leg(100, 110, 6), ...leg(110, 102, 5), ...leg(102, 110, 6), ...leg(110, 106, 5)];
  const mirror = (xs: number[]) => xs.map((x) => 200 - x);

  it("does not read crossed on a close about 2 points over the tops", () => {
    const r = readMultipleTops(bars([...testing, 108, 112.5])).top;
    expect(r).toMatchObject({ tests: 2, state: "testing" });
    expect(readMultipleTops(bars(mirror([...testing, 108, 112.5]))).bottom).toMatchObject({ tests: 2, state: "testing" });
  });

  it("reads crossed past the 3-point line, and not once price is back under the top", () => {
    const line = beyondByThreePoints(110.5, 1);
    expect(readMultipleTops(bars([...testing, 108, line + 0.5])).top).toMatchObject({ state: "crossed" });
    expect(readMultipleTops(bars([...testing, 108, line + 0.5, 109])).top?.state).not.toBe("crossed");
    expect(readMultipleTops(bars(mirror([...testing, 108, line + 0.5]))).bottom).toMatchObject({ state: "crossed" });
    expect(readMultipleTops(bars(mirror([...testing, 108, line + 0.5, 109]))).bottom?.state).not.toBe("crossed");
  });
});

describe("A-LEVELS-04 and C-LEVELS-06 on uneven tops (review 23)", () => {
  const leg = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => Math.round((a + ((b - a) * (i + 1)) / n) * 100) / 100);
  // Tests at ~110.5 and ~113.5 (mean 112), then a dip that holds.
  const tops = [...leg(90, 110, 6), ...leg(110, 102, 5), ...leg(102, 113, 6), ...leg(113, 110, 3)];

  it("fails 3 points under the tests' mean, not under the highest test", () => {
    const between = (beyondByThreePoints(112, -1) + beyondByThreePoints(113.5, -1)) / 2;
    expect(readMultipleTops(bars([...tops, between])).top?.state).not.toBe("failed");
    const under = beyondByThreePoints(112, -1) - 0.3;
    expect(readMultipleTops(bars([...tops, under])).top).toMatchObject({ state: "failed", level: 113.5 });
  });

  it("is crossed only 3 points over the highest test", () => {
    const between = (beyondByThreePoints(112, 1) + beyondByThreePoints(113.5, 1)) / 2;
    expect(readMultipleTops(bars([...tops, between])).top?.state).not.toBe("crossed");
    expect(readMultipleTops(bars([...tops, beyondByThreePoints(113.5, 1) + 0.3])).top?.state).toBe("crossed");
  });
});
