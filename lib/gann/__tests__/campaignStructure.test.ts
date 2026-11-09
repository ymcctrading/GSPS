import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { buildCampaignLedger, campaignMonthOrdinal, readCampaignAge } from "../campaignLedger";
import { pricePoint } from "../pointScale";

/** One bar per calendar day from 2026-01-01; each bar spans close ± 0.5. */
function daily(closes: number[]): Bar[] {
  return closes.map((c, i) => ({
    t: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
    o: c,
    h: c + 0.5,
    l: c - 0.5,
    c,
    v: 1000,
  }));
}

function steppingAdvance(cycles: number): number[] {
  const out: number[] = [];
  let p = 100;
  for (let k = 0; k < cycles; k++) {
    for (let i = 0; i < 6; i++) out.push((p += 1));
    for (let i = 0; i < 3; i++) out.push((p -= 0.5));
  }
  return out;
}

describe("C-TIME-27: campaign age in months, culmination months and the ceiling", () => {
  it("counts months with the start month as the first (Master Course Ch.6 PDF 197: Mar 1901 to Oct 1911 is the 128th month)", () => {
    expect(campaignMonthOrdinal("1901-03-15", "1911-10-02")).toBe(128);
    expect(campaignMonthOrdinal("1901-03-15", "1929-09-03")).toBe(343);
    expect(campaignMonthOrdinal("2026-01-05", "2026-01-30")).toBe(1);
  });

  it("flags the 1931 and 1935 culmination months", () => {
    expect(readCampaignAge(23)).toMatchObject({ culmination1931: true, culmination1935: true });
    expect(readCampaignAge(27)).toMatchObject({ culmination1931: false, culmination1935: true });
    expect(readCampaignAge(55)).toMatchObject({ culmination1931: true, culmination1935: false });
    expect(readCampaignAge(20)).toMatchObject({ culmination1931: false, culmination1935: false });
  });

  it("flags a campaign past 3 years and past 3½ years", () => {
    expect(readCampaignAge(36)).toMatchObject({ pastThreeYears: false, pastThreeAndHalfYears: false });
    expect(readCampaignAge(37)).toMatchObject({ pastThreeYears: true, pastThreeAndHalfYears: false });
    expect(readCampaignAge(43)).toMatchObject({ pastThreeYears: true, pastThreeAndHalfYears: true });
  });

  it("is on the ledger, counted from the campaign's start to the last bar", () => {
    const l = buildCampaignLedger(daily([...steppingAdvance(5), 131, 132]))!;
    expect(l.age.month).toBe(campaignMonthOrdinal(l.campaignStartDate, "2026-02-17"));
  });
});

describe("C-PRICE-01: a prior range added to a later low as a resistance candidate", () => {
  it("adds the last completed leg with the trend to the bottom that followed it (Master Course Ch.6 PDF 197)", () => {
    const l = buildCampaignLedger(daily([...steppingAdvance(5), 131, 132]))!;
    const p = l.rangeProjection!;
    expect(p).not.toBeNull();
    expect(p.kind).toBe("resistance");
    expect(p.priorRange).toBeGreaterThan(0);
    expect(p.price).toBeCloseTo(p.base + p.priorRange, 9);
  });

  it("mirrors in a bear campaign: the last top less the prior down leg, as support", () => {
    const closes = steppingAdvance(5).map((c) => 230 - c);
    const l = buildCampaignLedger(daily([...closes, 99, 98]))!;
    expect(l.trend).toBe("bearish");
    const p = l.rangeProjection!;
    expect(p.kind).toBe("support");
    expect(p.price).toBeCloseTo(p.base - p.priorRange, 9);
  });
});

describe("C-TREND-06: over-balance of space by 1 point or more", () => {
  it("separates a reaction that only just exceeds the greatest from one that exceeds it by a point", () => {
    const l = buildCampaignLedger(daily([...steppingAdvance(5), 131, 132]))!;
    // The flag that reads Gann's margin is the stricter one.
    if (l.spaceOverbalancedByPoint) expect(l.spaceOverbalanced).toBe(true);
    const base = steppingAdvance(5);
    let p = base[base.length - 1] + 3;
    const closes = [...base, p - 2, p - 1, p];
    for (let i = 0; i < 9; i++) closes.push((p -= 1.2));
    const big = buildCampaignLedger(daily(closes))!;
    expect(big.spaceOverbalanced).toBe(true);
    expect(big.spaceOverbalancedByPoint).toBe(true);
  });

  it("does not count an excess of under one point", () => {
    const base = steppingAdvance(5);
    const top = base[base.length - 1] + 3;
    const closes = [...base, top - 2, top - 1, top];
    const greatest = buildCampaignLedger(daily([...closes, top - 0.5, top - 1]))!.greatestCounterMove!;
    // A reaction a quarter point deeper than the greatest one, in percent of the top.
    const topHigh = top + 0.5;
    const pt = pricePoint(topHigh);
    const targetLow = topHigh * (1 - greatest.pct / 100) - pt / 4;
    const c = targetLow + 0.5;
    const l = buildCampaignLedger(daily([...closes, top - 1, (top - 1 + c) / 2, c]))!;
    expect(l.currentCounterMove).not.toBeNull();
    expect(l.spaceOverbalanced).toBe(true);
    expect(l.spaceOverbalancedByPoint).toBe(false);
  });
});

describe("campaign structure on the card and in the factor table", () => {
  it("records the readings as factors in the trade's direction and describes them", async () => {
    const { contextFactorsFor } = await import("../contextFactors");
    const { readDisclosedRules } = await import("../disclosedRules");
    const { describeCampaignLedger } = await import("../campaignLedger");
    const bars = daily([...steppingAdvance(5), 131, 132]);
    const ctx = readDisclosedRules(bars, 132, null, new Date("2026-02-17T21:00:00Z"));
    const long = contextFactorsFor(ctx, "bullish", 132);
    expect(typeof long.campaignCulminationMonthWithTrade).toBe("boolean");
    expect(typeof long.campaignPastCeilingWithTrade).toBe("boolean");
    expect(typeof long.overbalancedByPointAgainstCampaign).toBe("boolean");
    expect(typeof long.nearRangeProjection).toBe("boolean");
    const lines = describeCampaignLedger(ctx.campaign!);
    expect(lines.some((l) => l.includes("prior range"))).toBe(true);
  });

  it("names a culmination month on the card", async () => {
    const { describeCampaignLedger } = await import("../campaignLedger");
    const l = buildCampaignLedger(daily([...steppingAdvance(5), 131, 132]))!;
    const lines = describeCampaignLedger({ ...l, age: readCampaignAge(23) });
    expect(lines.some((x) => x.includes("23rd month"))).toBe(true);
  });
});
