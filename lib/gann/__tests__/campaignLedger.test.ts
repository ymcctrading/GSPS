import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { buildCampaignLedger } from "../campaignLedger";
import { contextFactorsFor } from "../contextFactors";
import { readDisclosedRules } from "../disclosedRules";

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

/** A stepping advance: 6 bars up 1.0, 3 bars down 0.5, repeated. */
function steppingAdvance(cycles: number): number[] {
  const out: number[] = [];
  let p = 100;
  for (let k = 0; k < cycles; k++) {
    for (let i = 0; i < 6; i++) out.push((p += 1));
    for (let i = 0; i < 3; i++) out.push((p -= 0.5));
  }
  return out;
}

describe("buildCampaignLedger", () => {
  it("records a bullish campaign's sections and its greatest reaction", () => {
    const l = buildCampaignLedger(daily([...steppingAdvance(5), 131, 132]))!;
    expect(l.trend).toBe("bullish");
    expect(l.sections).toBeGreaterThanOrEqual(3);
    expect(l.greatestCounterMove).not.toBeNull();
    expect(l.spaceOverbalanced).toBe(false);
    expect(l.timeOverbalanced).toBe(false);
  });

  it("flags over-balance when a reaction outlasts and outsizes every earlier one", () => {
    const base = steppingAdvance(5);
    let p = base[base.length - 1] + 3;
    const closes = [...base, p - 2, p - 1, p];
    for (let i = 0; i < 9; i++) closes.push((p -= 1.2));
    const l = buildCampaignLedger(daily(closes))!;
    expect(l.currentCounterMove).not.toBeNull();
    expect(l.spaceOverbalanced).toBe(true);
    expect(l.timeOverbalanced).toBe(true);
  });

  it("projects a time-balance date from the matching prior leg", () => {
    const l = buildCampaignLedger(daily([...steppingAdvance(4), 125, 126]))!;
    expect(l.timeBalanceDates.length).toBe(1);
  });

  it("returns null on too little history", () => {
    expect(buildCampaignLedger(daily([1, 2, 3]))).toBeNull();
  });
});

describe("contextFactorsFor", () => {
  it("records each reading as a yes/no factor in the trade's direction", () => {
    const bars = daily(steppingAdvance(6));
    const ctx = readDisclosedRules(bars, bars[bars.length - 1].c);
    const bull = contextFactorsFor(ctx, "bullish", bars[bars.length - 1].c);
    const bear = contextFactorsFor(ctx, "bearish", bars[bars.length - 1].c);
    expect(typeof bull.dayCountBandActive).toBe("boolean");
    expect(bull.withWeeklyTrend).toBe(true);
    expect(bear.withWeeklyTrend).toBe(false);
  });
});
