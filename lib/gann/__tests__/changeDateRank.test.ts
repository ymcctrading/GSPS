import { describe, expect, it } from "vitest";
import { YEAR_FRACTIONS } from "@/lib/gann/disclosedRules";
import { INCORPORATION_DEGREES } from "@/lib/gann/incorporationCycle";
import { SEASONAL_POINTS } from "@/lib/gann/seasonalCounts";
import { contextFactorsFor } from "@/lib/gann/contextFactors";
import { inSwingEighth, readSwingEighths } from "@/lib/gann/swingEighths";
import { readDisclosedRules, describeDisclosedRules } from "@/lib/gann/disclosedRules";
import type { Bar } from "@/lib/types";

// A-TIME-17: the dates marked X (W036 p.13), ranked by Master Course Ch. 14
// (PDF 389-390): anniversaries, then 1/2, then 3/4 (1/4 beside it, Ch. 18
// TP-1), then 1/3 and 2/3, then the eighths.
describe("the rank order of change dates", () => {
  const rankOf = (label: string) => YEAR_FRACTIONS.find((f) => f.label === label)!.rank;
  it("ranks the year's fractions in Ch. 14's order", () => {
    expect(rankOf("anniversary")).toBeLessThan(rankOf("1/2 year"));
    expect(rankOf("1/2 year")).toBeLessThan(rankOf("3/4 year"));
    expect(rankOf("3/4 year")).toBe(rankOf("1/4 year"));
    expect(rankOf("3/4 year")).toBeLessThan(rankOf("1/3 year"));
    expect(rankOf("1/3 year")).toBe(rankOf("2/3 year"));
    for (const e of ["1/8 year", "3/8 year", "5/8 year", "7/8 year"]) expect(rankOf(e)).toBeGreaterThan(rankOf("2/3 year"));
  });

  it("follows the same order from the incorporation date", () => {
    const deg = (d: number) => INCORPORATION_DEGREES.find((x) => x.degrees === d)!.rank;
    expect(deg(360)).toBeLessThan(deg(180));
    expect(deg(180)).toBeLessThan(deg(270));
    expect(deg(270)).toBe(deg(90));
    expect(deg(270)).toBeLessThan(deg(240));
    expect(deg(240)).toBe(deg(120));
    expect(deg(120)).toBeLessThan(deg(45));
  });

  it("follows it on the seasonal year from March 21, with the half and the full year together (Ch. 18 TP-1)", () => {
    const pt = (label: string) => SEASONAL_POINTS.find((p) => p.label === label)!.rank;
    expect(pt("the full year")).toBe(pt("½"));
    expect(pt("½")).toBeLessThan(pt("¾"));
    expect(pt("¾")).toBe(pt("¼"));
    expect(pt("¾")).toBeLessThan(pt("⅔"));
    expect(pt("⅔")).toBe(pt("⅓"));
  });
});

// A-OTHER-12, a labelled reconstruction: orders at the top or bottom eighth of a swing.
function bars(closes: number[]): Bar[] {
  const t0 = Date.parse("2026-03-02T00:00:00Z");
  return closes.map((c, i) => ({ t: new Date(t0 + i * 86_400_000).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 }));
}
// Up to a top, down to a bottom, then up three days to complete the swing.
const closes = [100, 102, 104, 106, 108, 110, 108, 106, 104, 102, 100, 98, 96, 98, 100, 102, 104];

describe("swing eighths", () => {
  it("divides the last completed 3-Day Chart swing by eight", () => {
    const r = readSwingEighths(bars(closes))!;
    expect(r.bottom).toBe(95.5);
    expect(r.top).toBe(110.5);
    expect(r.bottomEighth).toBeCloseTo(95.5 + 15 / 8, 10);
    expect(r.topEighth).toBeCloseTo(110.5 - 15 / 8, 10);
  });

  it("reads a long in the bottom eighth and a short in the top eighth, nothing between", () => {
    const r = readSwingEighths(bars(closes))!;
    expect(inSwingEighth(r, "bullish", 96)).toBe(true);
    expect(inSwingEighth(r, "bullish", 100)).toBe(false);
    expect(inSwingEighth(r, "bullish", 95)).toBe(false);
    expect(inSwingEighth(r, "bearish", 110)).toBe(true);
    expect(inSwingEighth(r, "bearish", 96)).toBe(false);
    expect(inSwingEighth(null, "bullish", 96)).toBe(false);
    expect(readSwingEighths(bars(closes), 96)!.at).toBe("bottomEighth");
    expect(readSwingEighths(bars(closes), 103)!.at).toBeNull();
  });

  it("needs a completed swing", () => {
    expect(readSwingEighths(bars([100, 101, 102]))).toBeNull();
  });

  it("is a measured factor and a context line, never a gate", () => {
    const ctx = readDisclosedRules(bars(closes), 96, null, new Date("2026-03-20T12:00:00Z"));
    expect(ctx.swingEighths?.at).toBe("bottomEighth");
    expect(contextFactorsFor(ctx, "bullish", 96).entryInSwingEighth).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", 96).entryInSwingEighth).toBe(false);
    expect(describeDisclosedRules(ctx).some((l) => l.startsWith("Price is in the bottom eighth"))).toBe(true);
  });
});
