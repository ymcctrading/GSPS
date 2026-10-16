/**
 * Never too high to buy while the trend is up, nor too low to sell while it is
 * down (A-TREND-09, W006 pp.22, 38-39), PLAN.md item 6 step 11, fork F1 (b):
 * the with-trend buying point arms on the trend alone, read over the monthly,
 * weekly and daily charts with the power ratio (A-TREND-01, W004), with no
 * momentum, breadth or quota gate. With no trend on any of them, both sides
 * arm and the nearer buying point is the one (fork F4 a).
 */
import { describe, expect, it } from "vitest";
import type { TrendReading } from "@/lib/types";
import type { GannEntryTrigger } from "@/lib/gann/entryTrigger";
import { armSessionEntries, gannMacroDirection, reversionEntry } from "@/lib/scan/entrySelection";

const trend = (timeframe: TrendReading["timeframe"], direction: TrendReading["direction"]): TrendReading =>
  ({ timeframe, direction, support: [], resistance: [] }) as unknown as TrendReading;
const fake = (direction: "bullish" | "bearish", level: number): GannEntryTrigger =>
  ({ kind: "crossing", direction, level, reactionEntry: level, triggerPrice: level, stopPrice: level, reactionStop: level, armed: true }) as unknown as GannEntryTrigger;

describe("the trend the with-trend buying point follows", () => {
  it("weighs the monthly over the weekly and daily", () => {
    expect(gannMacroDirection([trend("1Month", "bullish"), trend("1Week", "bearish"), trend("1Day", "bearish")])).toBe("bullish");
  });

  it("follows the daily alone when the monthly and weekly show none", () => {
    expect(gannMacroDirection([trend("1Month", "sideways"), trend("1Week", "sideways"), trend("1Day", "bearish")])).toBe("bearish");
  });

  it("does not count the hourly", () => {
    expect(gannMacroDirection([trend("1Month", "sideways"), trend("1Week", "sideways"), trend("1Day", "sideways"), trend("1Hour", "bullish")])).toBeNull();
  });
});

describe("the buying points a session arms", () => {
  const up = [trend("1Month", "bullish"), trend("1Week", "bullish"), trend("1Day", "sideways")];
  const none = [trend("1Month", "sideways"), trend("1Week", "sideways"), trend("1Day", "sideways")];
  const entryOf = (d: "bullish" | "bearish") => (d === "bullish" ? fake("bullish", 104) : fake("bearish", 97));

  it("arms with the trend on the trend alone, and against it as a reversion", () => {
    const armed = armSessionEntries(up, entryOf, 100);
    expect(armed.map((a) => [a.setupKind, a.trigger.direction])).toEqual([
      ["reversion", "bearish"],
      ["continuation", "bullish"],
    ]);
  });

  it("with no trend, arms the nearer of the two sides", () => {
    expect(reversionEntry(none, entryOf, 100)?.direction).toBe("bearish");
    expect(reversionEntry(none, entryOf, 102)?.direction).toBe("bullish");
    expect(armSessionEntries(none, entryOf, 102).map((a) => [a.setupKind, a.trigger.direction])).toEqual([["reversion", "bullish"]]);
  });

  it("with no trend, arms the side that has a buying point when the other has none", () => {
    expect(reversionEntry(none, (d) => (d === "bullish" ? fake("bullish", 130) : null), 100)?.direction).toBe("bullish");
  });
});
