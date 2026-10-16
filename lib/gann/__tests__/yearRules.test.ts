import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Bar } from "@/lib/types";
import { readYearRanges } from "../yearRanges";
import { ANALOGUE_YEARS, readDecadeAnalogue } from "../decadeAnalogue";
import { NEVER_FAILING_RULES } from "@/lib/risk/neverFailingRules";
import { contextFactorsFor } from "../contextFactors";
import { describeDisclosedRules, readDisclosedRules } from "../disclosedRules";

function day(iso: string, h: number, l: number, c = (h + l) / 2): Bar {
  return { t: `${iso}T05:00:00.000Z`, o: c, h, l, c, v: 1_000_000 };
}

/** Weekdays of 2026 from Jan 2 to `until`, ranges 99-101 in Jan 2-7 and 98-102 in Jan 15-21. */
function year2026(until: string, lastClose: number): Bar[] {
  const out: Bar[] = [];
  for (let d = new Date("2026-01-02T00:00:00Z"); d.toISOString().slice(0, 10) <= until; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const iso = d.toISOString().slice(0, 10);
    const md = iso.slice(5);
    if (md >= "01-02" && md <= "01-07") out.push(day(iso, 101, 99));
    else if (md >= "01-15" && md <= "01-21") out.push(day(iso, 102, 98));
    else out.push(day(iso, 100.5, 99.5));
  }
  const last = out[out.length - 1];
  out[out.length - 1] = { ...last, h: Math.max(last.h, lastClose), l: Math.min(last.l, lastClose), c: lastClose };
  return out;
}

describe("A-TIME-20: the Jan 2-7 and Jan 15-21 ranges set the year's trend (Master Course Ch.7 PDF 221-223)", () => {
  it("reads the year up once price closes above the January ranges", () => {
    const r = readYearRanges(year2026("2026-03-02", 105), new Date("2026-03-02T20:00:00Z"));
    expect(r?.ranges.map((x) => x.window)).toEqual(["Jan 2-7", "Jan 15-21"]);
    expect(r?.ranges[0]).toMatchObject({ high: 101, low: 99, position: "above" });
    expect(r?.yearTrend).toBe("up");
  });

  it("reads the year down below them, and inside between", () => {
    expect(readYearRanges(year2026("2026-03-02", 95), new Date("2026-03-02T20:00:00Z"))?.yearTrend).toBe("down");
    expect(readYearRanges(year2026("2026-03-02", 100), new Date("2026-03-02T20:00:00Z"))?.yearTrend).toBe("inside");
  });

  it("does not read a window that has not closed yet", () => {
    const r = readYearRanges(year2026("2026-01-16", 105), new Date("2026-01-16T20:00:00Z"));
    expect(r?.ranges.map((x) => x.window)).toEqual(["Jan 2-7"]);
  });

  it("adds the July 3-7 and July 20-27 ranges once they close (PDF 223)", () => {
    const r = readYearRanges(year2026("2026-08-03", 105), new Date("2026-08-03T20:00:00Z"));
    expect(r?.ranges.map((x) => x.window)).toEqual(["Jan 2-7", "Jan 15-21", "Jul 3-7", "Jul 20-27"]);
  });
});

describe("A-TIME-14: a year runs like its decade analogues (Master Course Ch.2 PDF 51-52 Rule 9; Ch.7 PDF 224-225)", () => {
  function months(from: number, n: number, closeAt: (i: number) => number): Bar[] {
    return Array.from({ length: n }, (_, i) => {
      const y = from + Math.floor(i / 12);
      const m = (i % 12) + 1;
      const c = closeAt(i);
      return { t: `${y}-${String(m).padStart(2, "0")}-01T05:00:00.000Z`, o: c, h: c + 1, l: c - 1, c, v: 1 };
    });
  }

  it("reads the month ahead in the year ten years back", () => {
    // 2016: March closes 100, April 110. Asked in March 2026, the analogue says up.
    const bars = months(2013, 160, (i) => (i === 3 * 12 + 3 ? 110 : 100));
    const r = readDecadeAnalogue(bars, new Date("2026-03-15T20:00:00Z"));
    const ten = r?.analogues.find((a) => a.yearsBack === 10);
    expect(ten).toMatchObject({ year: 2016, direction: "up" });
    expect(r?.agreed).toBe("up");
  });

  it("reads all four analogues, 10, 20, 30 and 60 years back, and agrees only when all four do (A-TIME-29)", () => {
    // 61 years of months from 1965. Each analogue year's April closes above its
    // March; every other month is flat, so a wrong analogue year reads flat.
    const from = 1965;
    const up = new Set([2016, 2006, 1996, 1966]);
    const close = (down: number | null) => (i: number) => {
      const y = from + Math.floor(i / 12);
      const m = (i % 12) + 1;
      if (m !== 4 || !up.has(y)) return 100;
      return y === down ? 90 : 110;
    };
    const asOf = new Date("2026-03-15T20:00:00Z");
    const r = readDecadeAnalogue(months(from, 61 * 12 + 3, close(null)), asOf);
    expect(ANALOGUE_YEARS).toEqual([10, 20, 30, 60]);
    expect(r?.analogues.map((a) => a.yearsBack)).toEqual([10, 20, 30, 60]);
    expect(r?.analogues.map((a) => a.year)).toEqual([2016, 2006, 1996, 1966]);
    expect(r?.analogues.every((a) => a.direction === "up")).toBe(true);
    expect(r?.agreed).toBe("up");

    // The 60-year analogue alone pointing down breaks the agreement.
    expect(readDecadeAnalogue(months(from, 61 * 12 + 3, close(1966)), asOf)?.agreed).toBeNull();
  });

  it("returns no analogue the history cannot reach", () => {
    const bars = months(2020, 60, () => 100);
    expect(readDecadeAnalogue(bars, new Date("2026-03-15T20:00:00Z"))).toBeNull();
  });
});

describe("A-RISK-16: the 24 never-failing rules (Wall Street Stock Selector Ch.II pp.18-28)", () => {
  it("lists all 24, numbered in order", () => {
    expect(NEVER_FAILING_RULES.map((r) => r.n)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
  });

  it("points every enforced rule at a file that exists", () => {
    for (const r of NEVER_FAILING_RULES.filter((x) => x.status === "enforced" || x.status === "differs")) {
      expect(r.where, `rule ${r.n}`).toBeTruthy();
      expect(existsSync(path.resolve(process.cwd(), r.where!)), `rule ${r.n}: ${r.where}`).toBe(true);
    }
  });
});

describe("the year rules reach the live scan and the replay alike", () => {
  it("is read by readDisclosedRules, described, and turned into factors", () => {
    const bars = year2026("2026-03-02", 105);
    const ctx = readDisclosedRules(bars, 105, null, new Date("2026-03-02T20:00:00Z"));
    expect(ctx.yearRanges?.yearTrend).toBe("up");
    const f = contextFactorsFor(ctx, "bullish", 105);
    expect(f.yearRangeTrendWithTrade).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", 105).yearRangeTrendWithTrade).toBe(false);
    const lines = describeDisclosedRules(ctx).join("\n");
    expect(lines).toMatch(/January/);
    expect(lines.toLowerCase()).not.toContain(["g", "ann"].join(""));
  });
});

describe("A-TIME-14 factor sign (review of #331)", () => {
  it("reads an analogue that agrees up as with a long and against a short", async () => {
    const { EMPTY_DISCLOSED_RULES } = await import("../disclosedRules");
    const up = { ...EMPTY_DISCLOSED_RULES, decadeAnalogue: { analogues: [], agreed: "up" as const } };
    expect(contextFactorsFor(up, "bullish", 100).decadeAnalogueWithTrade).toBe(true);
    expect(contextFactorsFor(up, "bearish", 100).decadeAnalogueWithTrade).toBe(false);
    const down = { ...EMPTY_DISCLOSED_RULES, decadeAnalogue: { analogues: [], agreed: "down" as const } };
    expect(contextFactorsFor(down, "bearish", 100).decadeAnalogueWithTrade).toBe(true);
  });
});
