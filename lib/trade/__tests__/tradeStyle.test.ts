import { describe, expect, it } from "vitest";
import { parseTradeStyle } from "@/lib/trade/tradeStyle";
import { priceFastLevels, styleStop } from "@/lib/trade/tradeStylePlan";
import { computeTradeLevels, type EntrySource } from "@/lib/strat/levels";
import type { Bar } from "@/lib/types";

const prev: Bar = { t: "2026-10-20T00:00:00Z", o: 100, h: 101, l: 99, c: 100, v: 1 };

describe("trade style", () => {
  it("defaults to swing", () => {
    expect(parseTradeStyle(undefined)).toBe("swing");
    expect(parseTradeStyle("fast")).toBe("fast");
    expect(parseTradeStyle("day")).toBe("swing");
  });

  it("swing keeps the plan's stop; fast puts it 3 points under the last day's low", () => {
    const base = { direction: "bullish" as const, entry: 104, planStop: 92 };
    expect(styleStop({ ...base, style: "swing", lastDay: { h: 105, l: 101 } })).toBe(92);
    const fast = styleStop({ ...base, style: "fast", lastDay: { h: 105, l: 101 } });
    expect(fast).toBeGreaterThan(92);
    expect(fast).toBeLessThan(101);
  });

  it("keeps the swing stop when the day stop would be on or past the entry", () => {
    expect(styleStop({ style: "fast", direction: "bullish", entry: 100, planStop: 92, lastDay: { h: 110, l: 108 } })).toBe(92);
  });

  it("prices a fast plan with a tighter stop and targets re-read against it", () => {
    const source: EntrySource = { direction: "bullish", triggerPrice: 104, stopPrice: 92, gannReaction: true };
    const price = (s: EntrySource) => computeTradeLevels(s, prev, [], undefined, 1, "us_equity", false, [110, 112, 120]);
    const swing = price(source);
    const fast = priceFastLevels(swing, source, { h: 105, l: 101 }, price)!;
    expect(fast.entry).toBe(swing.entry);
    expect(fast.stopLoss).toBeGreaterThan(swing.stopLoss);
    expect(fast.riskPerShare).toBeLessThan(swing.riskPerShare);
  });

  it("offers no fast plan when the day stop is no tighter", () => {
    const source: EntrySource = { direction: "bullish", triggerPrice: 104, stopPrice: 100, gannReaction: true };
    const price = (s: EntrySource) => computeTradeLevels(s, prev, [], undefined, 1, "us_equity", false, []);
    expect(priceFastLevels(price(source), source, { h: 105, l: 101 }, price)).toBeNull();
  });
});
