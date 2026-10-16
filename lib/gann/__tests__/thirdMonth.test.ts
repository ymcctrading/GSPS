/**
 * A reaction that runs into its third month is a change of trend (PLAN.md
 * item 7 step 3; A-TIME-01, W006 p.38: in a bull market a stock reacts no more
 * than two to three months and resumes in the third, while a falling stock
 * keeps falling in the third month; A-TIME-02, the bear-market mirror). The
 * months are the counter-move clock's own: the third month starts after 60
 * days (`counterMovePhase`).
 */
import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { buildCampaignLedger, describeCampaignLedger } from "@/lib/gann/campaignLedger";
import { readGannTrend } from "@/lib/gann/trendStrength";
import { counterMovePhase } from "@/lib/gann/disclosedRules";

const DAY = 86_400_000;
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
function daily(closes: number[], half = 0.3): Bar[] {
  const t0 = Date.parse("2025-01-02T05:00:00Z");
  return closes.map((c, i) => ({ t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + half, l: c - half, c, v: 1e6 }));
}
/** A campaign whose first reaction (81 to 60 over 80 days) is deeper and longer than the one under test. */
const CAMPAIGN = [...leg(30, 40, 20), ...leg(40, 81, 60), ...leg(81, 60, 80), ...leg(60, 120, 120)];
const mirror = (bars: Bar[]): Bar[] => bars.map((b) => ({ ...b, o: 300 - b.o, c: 300 - b.c, h: 300 - b.l, l: 300 - b.h }));

describe("a reaction into its third month (A-TIME-01)", () => {
  // From the 120 top: still making new lows on day 70.
  const third = daily([...CAMPAIGN, ...leg(120, 106, 70)]);

  it("changes the trend when the reaction is still making new lows in its third month", () => {
    const ledger = buildCampaignLedger(third)!;
    expect(ledger.spaceOverbalanced || ledger.timeOverbalanced).toBe(false);
    expect(ledger.counterMoveThirdMonth).toBe(true);
    expect(describeCampaignLedger(ledger)).toContain("Still making new lows in the counter-move's third month: the trend is changing.");
    const t = readGannTrend(third);
    expect(t.changing).toBe(true);
    expect(t.direction).toBeNull();
  });

  it("leaves the trend alone when the reaction made its low in the second month and has held since", () => {
    // The low on day 45, then 25 flat days: the reaction is 70 days old but made no new low in its third month.
    const held = daily([...CAMPAIGN, ...leg(120, 106, 45), ...Array.from({ length: 25 }, () => 106)]);
    const ledger = buildCampaignLedger(held)!;
    expect(ledger.currentCounterMove?.days).toBe(70);
    expect(ledger.counterMoveThirdMonth).toBe(false);
    expect(readGannTrend(held).changing).toBe(false);
  });

  it("leaves the trend alone in the second month", () => {
    const second = daily([...CAMPAIGN, ...leg(120, 110, 45)]);
    expect(buildCampaignLedger(second)!.counterMoveThirdMonth).toBe(false);
    expect(readGannTrend(second).direction).toBe("bullish");
  });

  it("starts the third month where the counter-move clock does", () => {
    expect(counterMovePhase(60)).toBe("secondMonth");
    expect(counterMovePhase(61)).toBe("thirdMonth");
    // A low on day 60 is still the second month; on day 61 it is the third.
    expect(buildCampaignLedger(daily([...CAMPAIGN, ...leg(120, 110, 60)]))!.counterMoveThirdMonth).toBe(false);
    expect(buildCampaignLedger(daily([...CAMPAIGN, ...leg(120, 110, 61)]))!.counterMoveThirdMonth).toBe(true);
  });
});

describe("a bear-market rally into its third month (A-TIME-02)", () => {
  it("changes a bear trend the same way", () => {
    const third = mirror(daily([...CAMPAIGN, ...leg(120, 106, 70)]));
    const ledger = buildCampaignLedger(third)!;
    expect(ledger.trend).toBe("bearish");
    expect(ledger.counterMoveThirdMonth).toBe(true);
    expect(readGannTrend(third).direction).toBeNull();
    const second = mirror(daily([...CAMPAIGN, ...leg(120, 110, 45)]));
    expect(readGannTrend(second).direction).toBe("bearish");
  });
});
