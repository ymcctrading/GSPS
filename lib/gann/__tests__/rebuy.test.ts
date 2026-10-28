import { describe, expect, it } from "vitest";
import { pricePoint } from "@/lib/gann/pointScale";
import { gannRebuy, rebuyOffer, rebuysOn, REBUY_REACTION_POINTS } from "@/lib/gann/rebuy";

// W022 p.198: stopped near the top after about 230, bought again at 218 (down
// a little over 12) with a stop at 212.
describe("buying again after a stop, on the reaction (A-PYRAMID-07)", () => {
  it("rests 12 points under the best price with the stop half the reaction below, as he did at 230", () => {
    const r = gannRebuy({ side: "long", extreme: 230, trend: "bullish" })!;
    expect(r.entry).toBeCloseTo(218, 9);
    expect(r.stop).toBeCloseTo(212, 9);
    expect(REBUY_REACTION_POINTS).toBeCloseTo(12 / pricePoint(230), 12);
  });
  it("scales the reaction with price on the point scale", () => {
    const r = gannRebuy({ side: "long", extreme: 42.5, trend: "bullish" })!;
    expect(r.entry).toBeCloseTo(42.5 - REBUY_REACTION_POINTS * pricePoint(42.5), 9);
  });
  it("mirrors for a short: a rally above its low, stop above", () => {
    const r = gannRebuy({ side: "short", extreme: 50, trend: "bearish" })!;
    expect(r.entry).toBeGreaterThan(50);
    expect(r.stop).toBeGreaterThan(r.entry);
    expect(r.stop - r.entry).toBeCloseTo((r.entry - 50) / 2, 9);
  });
  it("doesn't buy again unless the trade ran past its own entry by the reaction", () => {
    expect(gannRebuy({ side: "long", extreme: 230, trend: "bullish", entryPrice: 150 })).not.toBeNull();
    expect(gannRebuy({ side: "long", extreme: 230, trend: "bullish", entryPrice: 225 })).toBeNull();
    expect(gannRebuy({ side: "short", extreme: 50, trend: "bearish", entryPrice: 50.5 })).toBeNull();
  });
  it("doesn't buy again once the trend no longer runs the trade's way", () => {
    expect(gannRebuy({ side: "long", extreme: 230, trend: "bearish" })).toBeNull();
    expect(gannRebuy({ side: "long", extreme: 230, trend: null })).toBeNull();
  });
  it("follows a trailing stop only, not the first stop or an exit signal", () => {
    expect(rebuysOn("break_even")).toBe(true);
    expect(rebuysOn("prior_week")).toBe(true);
    expect(rebuysOn("stop")).toBe(true);
    expect(rebuysOn("initial")).toBe(false);
    expect(rebuysOn("trend_change")).toBe(false);
    expect(rebuysOn(null)).toBe(false);
  });
  it("offers it in plain words", () => {
    const text = rebuyOffer("AAPL", gannRebuy({ side: "long", extreme: 230, trend: "bullish" })!);
    expect(text).toMatch(/buy again/);
    expect(text).not.toMatch(/gann/i);
  });
});
