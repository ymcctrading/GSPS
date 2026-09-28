import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { readCapitalStock } from "../capitalStock";
import { toWeeklyBars } from "../disclosedRules";

/** Weekday daily bars from [close, volume] pairs, starting Monday 2026-01-05. */
function daily(rows: Array<[number, number]>): Bar[] {
  const out: Bar[] = [];
  let d = Date.UTC(2026, 0, 5);
  for (const [c, v] of rows) {
    while ([0, 6].includes(new Date(d).getUTCDay())) d += 86_400_000;
    out.push({ t: new Date(d).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v });
    d += 86_400_000;
  }
  return out;
}

/** 12 weeks of advance on 1,000 a day, then a final week at the high with `lastWeekDaily` a day. */
function advanceThenHeavyWeek(lastWeekDaily: number): Bar[] {
  const rows: Array<[number, number]> = [];
  for (let i = 0; i < 60; i++) rows.push([50 + i, 1000]);
  for (let i = 0; i < 5; i++) rows.push([110, lastWeekDaily]);
  return daily(rows);
}

const read = (bars: Bar[], shares: number | null) => readCapitalStock(bars, toWeeklyBars(bars), shares);

describe("capital-stock turnover (parity D2)", () => {
  it("is absent without a share count", () => {
    expect(read(advanceThenHeavyWeek(1000), null)).toBeNull();
  });

  it("reads two-thirds of the stock in one week at a top as distribution", () => {
    // 5 days x 14,000 = 70,000 of 100,000 shares.
    const r = read(advanceThenHeavyWeek(14_000), 100_000)!;
    expect(r.peakRecentWeekTurnover).toBeCloseTo(0.7);
    expect(r.peakWeekAtTop).toBe(true);
    expect(r.distributionWeek).toBe(true);
    expect(r.plainTopWeek).toBe(false);
    expect(r.distributionSignal).toBe(true);
  });

  it("reads a week turning over almost all the stock as a plain top", () => {
    const r = read(advanceThenHeavyWeek(19_000), 100_000)!;
    expect(r.plainTopWeek).toBe(true);
  });

  it("drops a share count that can't be right", () => {
    // 5,000 a week against 10,000 shares: half the stock every week.
    expect(read(advanceThenHeavyWeek(1000), 10_000)).toBeNull();
  });

  it("does not call ordinary turnover distribution", () => {
    const r = read(advanceThenHeavyWeek(1000), 100_000)!;
    expect(r.latestWeekTurnover).toBeCloseTo(0.05);
    expect(r.distributionSignal).toBe(false);
  });

  it("does not call a heavy week at a low distribution (that is D1's panic climax)", () => {
    const rows: Array<[number, number]> = [];
    for (let i = 0; i < 60; i++) rows.push([110 - i, 1000]);
    for (let i = 0; i < 5; i++) rows.push([50, 20_000]);
    const r = read(daily(rows), 100_000)!;
    expect(r.peakRecentWeekTurnover).toBeGreaterThan(0.9);
    expect(r.peakWeekAtTop).toBe(false);
    expect(r.distributionSignal).toBe(false);
  });
});

describe("readDisclosedRules carries the D2 and D3 readings", () => {
  it("fills both when the instrument facts are supplied, and neither without", async () => {
    const { readDisclosedRules } = await import("../disclosedRules");
    const bars = advanceThenHeavyWeek(14_000);
    const withFacts = readDisclosedRules(bars, 110, {
      sharesOutstanding: 100_000,
      inception: { date: "1990-02-06", precision: "day" },
    }, new Date("2026-02-06T12:00:00Z"));
    expect(withFacts.capitalStock?.distributionWeek).toBe(true);
    expect(withFacts.incorporation?.degree?.degrees).toBe(360);
    const without = readDisclosedRules(bars, 110);
    expect(without.capitalStock).toBeNull();
    expect(without.incorporation).toBeNull();
  });
});
