/**
 * C-SWING-01 (Additional Cycle Findings, W003 p.16, class C): corrections
 * within an uptrend tend to be nearly equal in size. No tolerance is given, so
 * one is fixed here before any measurement. Context only.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { buildCampaignLedger, EQUAL_CORRECTION_RATIO } from "@/lib/gann/campaignLedger";
import { contextFactorsFor } from "@/lib/gann/contextFactors";
import { describeDisclosedRules, readDisclosedRules } from "@/lib/gann/disclosedRules";

const DAY = 86_400_000;
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
function daily(closes: number[], half = 0.3): Bar[] {
  const t0 = Date.parse("2026-01-01T05:00:00Z");
  return closes.map((c, i) => ({ t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + half, l: c - half, c, v: 1e6 }));
}
/** A bull campaign from 100 whose reactions are the given percents. */
function advance(reactions: number[]): number[] {
  const out: number[] = [...leg(110, 100, 6)];
  let p = 100;
  for (const r of reactions) {
    const top = p * 1.2;
    out.push(...leg(p, top, 8));
    p = top * (1 - r / 100);
    out.push(...leg(top, p, 5));
  }
  out.push(...leg(p, p * 1.15, 8));
  return out;
}

describe("nearly equal corrections in an uptrend (C-SWING-01)", () => {
  it("fixes the tolerance before measuring: the largest of the last three within 1.25x the smallest", () => {
    expect(EQUAL_CORRECTION_RATIO).toBe(1.25);
  });

  it("flags three reactions of about the same size", () => {
    expect(buildCampaignLedger(daily(advance([5, 5.5, 5])))!.equalCorrections).toBe(true);
  });

  it("does not flag reactions that differ by more than the tolerance", () => {
    expect(buildCampaignLedger(daily(advance([6, 4, 2])))!.equalCorrections).toBe(false);
    expect(buildCampaignLedger(daily(advance([4, 4, 7])))!.equalCorrections).toBe(false);
  });

  it("needs three corrections", () => {
    expect(buildCampaignLedger(daily(advance([5, 5])))!.equalCorrections).toBe(false);
  });

  it("is read for an uptrend only, as the text gives it", () => {
    const bear = daily(advance([5, 5.5, 5]).map((c) => 300 - c));
    const l = buildCampaignLedger(bear)!;
    expect(l.trend).toBe("bearish");
    expect(l.equalCorrections).toBe(false);
  });

  it("is shown for context and measured on a trade with the campaign's trend", () => {
    const bars = daily(advance([5, 5.5, 5]));
    const ctx = readDisclosedRules(bars, bars[bars.length - 1].c, null, new Date(bars[bars.length - 1].t));
    expect(describeDisclosedRules(ctx).some((l) => /nearly equal/.test(l) && /Shown for context/.test(l))).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", bars[bars.length - 1].c).equalCorrectionsWithTrade).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", bars[bars.length - 1].c).equalCorrectionsWithTrade).toBe(false);
  });
});
