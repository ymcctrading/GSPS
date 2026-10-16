/**
 * "Bear-market rallies last 2-3 weeks: sell at the end of the second or third
 * week" (W006 p.47, Rule 4, A-ENTRY-18). The bear market is the main trend
 * down, read on the monthly, weekly and daily charts with the power ratio
 * (A-TREND-01), not the weekly chart alone: a rally against a weekly decline
 * inside a monthly advance is a reaction in a bull market, which Gann buys
 * (replay runs 39-40, the rally sale at -0.15R on 145 trades, were sales of
 * exactly those).
 */
import { describe, expect, it } from "vitest";
import type { Bar, TrendReading } from "@/lib/types";
import { selectGannEntry } from "@/lib/gann/entryTrigger";
import { gannEntryOf } from "@/lib/scan/entrySelection";

const DAY = 86_400_000;
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
function daily(closes: number[], half = 0.3): Bar[] {
  const t0 = Date.parse("2026-03-02T04:00:00Z");
  return closes.map((c, i) => ({ t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + half, l: c - half, c, v: 1e6 }));
}
const BEAR = [...leg(140, 120, 8), ...leg(120, 128, 4), ...leg(128, 108, 8), ...leg(108, 116, 4), ...leg(116, 90, 10)];
const BARS = daily([...BEAR, ...leg(90, 90 + 13 * 0.6, 13)]);
const trend = (timeframe: TrendReading["timeframe"], direction: TrendReading["direction"]): TrendReading =>
  ({ timeframe, direction, support: [], resistance: [] }) as unknown as TrendReading;

describe("the rally sale needs the main trend down", () => {
  it("is offered only when allowed", () => {
    expect(selectGannEntry(BARS, "bearish", [], undefined, true)?.holdBasis).toBe("rally");
    expect(selectGannEntry(BARS, "bearish", [], undefined, false)?.holdBasis).not.toBe("rally");
  });

  it("is sold in a bear market", () => {
    const bear = [trend("1Month", "bearish"), trend("1Week", "bearish"), trend("1Day", "bullish")];
    expect(gannEntryOf(BARS, [], bear)("bearish")?.holdBasis).toBe("rally");
  });

  it("is not sold while the monthly trend is up, however the weekly reads", () => {
    const bull = [trend("1Month", "bullish"), trend("1Week", "bearish"), trend("1Day", "bearish")];
    expect(gannEntryOf(BARS, [], bull)("bearish")?.holdBasis).not.toBe("rally");
  });

  it("is not sold with no trend on any chart", () => {
    const none = [trend("1Month", "sideways"), trend("1Week", "sideways"), trend("1Day", "sideways")];
    expect(gannEntryOf(BARS, [], none)("bearish")?.holdBasis).not.toBe("rally");
  });
});

