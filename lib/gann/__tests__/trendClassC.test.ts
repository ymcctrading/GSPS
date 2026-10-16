/**
 * Two trend readings from a compiler of Gann's teaching (W003 p.17, class C),
 * kept as context and measured, never gating (PLAN.md item 6, step 2): late in
 * a trend each reaction is smaller than the one before (C-TREND-04), and a
 * rising market spends more time rising than falling (C-TREND-07).
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { buildCampaignLedger } from "@/lib/gann/campaignLedger";
import { contextFactorsFor } from "@/lib/gann/contextFactors";
import { readDisclosedRules } from "@/lib/gann/disclosedRules";

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

describe("reactions getting smaller late in a trend (C-TREND-04)", () => {
  it("reads three reactions of 6%, 4% and 2% as contracting", () => {
    const l = buildCampaignLedger(daily(advance([6, 4, 2])))!;
    expect(l.trend).toBe("bullish");
    expect(l.contracting).toBe(true);
  });

  it("does not when one is larger than the one before", () => {
    expect(buildCampaignLedger(daily(advance([6, 7, 2])))!.contracting).toBe(false);
    expect(buildCampaignLedger(daily(advance([6, 4, 5])))!.contracting).toBe(false);
  });

  it("needs three reactions", () => {
    expect(buildCampaignLedger(daily(advance([6, 4])))!.contracting).toBe(false);
  });
});

describe("more time against the trend than with it (C-TREND-07)", () => {
  it("sums the days of each side and flags a market that has spent more time falling", () => {
    // Up 6 days, down 8, up 4, down 9, up 4: higher bottoms all the way.
    const bars = daily([...leg(110, 100, 6), ...leg(100, 110, 6), ...leg(110, 104, 8), ...leg(104, 112, 4), ...leg(112, 107, 9), ...leg(107, 115, 4)]);
    const l = buildCampaignLedger(bars)!;
    expect(l.trend).toBe("bullish");
    // 6 + 4 up and the open 4 up; 8 + 9 down.
    expect([l.trendDays, l.counterDays]).toEqual([14, 17]);
    expect(l.timeRatioInverted).toBe(true);
    // A counter-move under way counts on its side.
    const reacting = buildCampaignLedger(daily([...bars.map((b) => b.c), 113, 112.5, 112]))!;
    expect([reacting.trendDays, reacting.counterDays]).toEqual([14, 20]);
  });

  it("does not flag equal time on each side", () => {
    const bars = daily([...leg(110, 100, 6), ...leg(100, 110, 6), ...leg(110, 104, 8), ...leg(104, 112, 4), ...leg(112, 107, 6), ...leg(107, 115, 4)]);
    const l = buildCampaignLedger(bars)!;
    expect([l.trendDays, l.counterDays]).toEqual([14, 14]);
    expect(l.timeRatioInverted).toBe(false);
  });

  it("does not when the trend has had the time", () => {
    const l = buildCampaignLedger(daily(advance([6, 4, 2])))!;
    expect(l.trendDays).toBeGreaterThan(l.counterDays);
    expect(l.timeRatioInverted).toBe(false);
  });
});

describe("as context only", () => {
  it("is a factor on a trade with the campaign's trend, and on no other", () => {
    const bars = daily(advance([6, 4, 2]));
    const ctx = readDisclosedRules(bars, bars.at(-1)!.c, null, new Date("2026-06-01T00:00:00Z"));
    expect(contextFactorsFor(ctx, "bullish", bars.at(-1)!.c).reactionsContractingWithTrade).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", bars.at(-1)!.c).reactionsContractingWithTrade).toBe(false);
  });
});
