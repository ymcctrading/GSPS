/**
 * A-TIME-07 (New Stock Trend Detector, 1936, Ch. III p. 12): bull campaigns
 * repeat in length (97 months against 99). The prior completed campaign's
 * length is projected from the current campaign's start. Context only.
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { completedBullCampaigns, readCampaignLength } from "@/lib/gann/campaignLength";
import { describeDisclosedRules, readDisclosedRules } from "@/lib/gann/disclosedRules";
import { contextFactorsFor } from "@/lib/gann/contextFactors";

const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
/** One bar a month from January 2000; each bar spans 1% around its close. */
function months(closes: number[]): Bar[] {
  return closes.map((c, i) => {
    const d = new Date(Date.UTC(2000, i, 1, 5));
    return { t: d.toISOString(), o: c, h: c * 1.01, l: c * 0.99, c, v: 1e8 };
  });
}
const monthOf = (bars: Bar[], i: number) => bars[i].t.slice(0, 7);

// A bear first (so the first campaign's start is a real low), then a bull
// campaign with two reactions, a bear that breaks its last reaction bottom, and
// a second bull campaign that runs on.
const closes = [
  100, ...leg(100, 92, 2), ...leg(92, 95, 2), ...leg(95, 60, 10), // bear to the first low
  ...leg(60, 80, 6), ...leg(80, 76, 2), ...leg(76, 100, 8), ...leg(100, 96, 2), ...leg(96, 120, 12), // bull to the top
  ...leg(120, 110, 3), ...leg(110, 113, 2), ...leg(113, 85, 8), // bear
  ...leg(85, 95, 4), ...leg(95, 91, 2), ...leg(91, 140, 40), // the current bull
];
const MARKET = months(closes);
const FIRST_LOW = MARKET.findIndex((b) => b.c === 60);
const FIRST_TOP = MARKET.findIndex((b) => b.c === 120);
const SECOND_LOW = MARKET.findIndex((b, i) => i > FIRST_TOP && b.c === 85);

describe("bull campaign lengths (A-TIME-07)", () => {
  it("measures a completed campaign from its lowest to its highest month", () => {
    const done = completedBullCampaigns(MARKET);
    expect(done).toHaveLength(1);
    expect(done[0]).toEqual({ start: monthOf(MARKET, FIRST_LOW), top: monthOf(MARKET, FIRST_TOP), months: FIRST_TOP - FIRST_LOW });
  });

  it("projects the prior length from the current campaign's start", () => {
    const prior = FIRST_TOP - FIRST_LOW;
    const at = (i: number) => readCampaignLength(MARKET.slice(0, i + 1), new Date(MARKET[i].t));
    const r = at(SECOND_LOW + prior);
    expect(r?.current?.start).toBe(monthOf(MARKET, SECOND_LOW));
    expect(r?.current?.months).toBe(prior);
    expect(r?.projectedTop).toBe(monthOf(MARKET, SECOND_LOW + prior));
    expect(r?.atPriorLength).toBe(true);
    expect(at(SECOND_LOW + prior - 2)?.atPriorLength).toBe(true);
    expect(at(SECOND_LOW + prior - 3)?.atPriorLength).toBe(false);
    expect(at(SECOND_LOW + prior + 3)?.atPriorLength).toBe(false);
  });

  it("says there is no prior campaign when the feed holds none", () => {
    // Only the current campaign: the first one is cut off by the feed's start.
    const short = MARKET.slice(FIRST_TOP + 1);
    const r = readCampaignLength(short, new Date(short[short.length - 1].t));
    expect(r?.prior).toBeNull();
    expect(r?.projectedTop).toBeNull();
    expect(r?.atPriorLength).toBe(false);
  });
});

describe("on the setup", () => {
  const i = SECOND_LOW + (FIRST_TOP - FIRST_LOW);
  const asOf = new Date(Date.UTC(2000, i, 20));
  const daily: Bar[] = Array.from({ length: 80 }, (_, k) => {
    const d = new Date(asOf.getTime() - (79 - k) * 86_400_000);
    const c = 50 + Math.sin(k / 4) * 3;
    return { t: d.toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 };
  });
  const marketMonthly = MARKET.slice(0, i);

  it("is read on every scan from the market's monthly bars, and shown for context", () => {
    const ctx = readDisclosedRules(daily, daily[daily.length - 1].c, { sharesOutstanding: null, inception: null, marketMonthly, marketDaily: [] }, asOf);
    expect(ctx.campaignLength?.atPriorLength).toBe(true);
    expect(describeDisclosedRules(ctx).some((l) => /bull campaign/.test(l) && /Shown for context/.test(l))).toBe(true);
    expect(contextFactorsFor(ctx, "bullish", 50).bullCampaignAtPriorLength).toBe(true);
    expect(contextFactorsFor(ctx, "bearish", 50).bullCampaignAtPriorLength).toBe(true);
  });
});
