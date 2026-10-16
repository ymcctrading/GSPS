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
import { counterMovePhase, describeDisclosedRules, readDisclosedRules } from "@/lib/gann/disclosedRules";

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
    expect(describeDisclosedRules(readDisclosedRules(third, 106)).some((l) => l.includes("in its third month, which signals a change in trend"))).toBe(true);
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
    // The card's counter-move line agrees with the trend read (item 7 review M1).
    const lines = describeDisclosedRules(readDisclosedRules(held, 106));
    expect(lines.some((l) => l.includes("past two months, though it has made no new extreme in its third month"))).toBe(true);
    expect(lines.some((l) => l.includes("signals a change in trend"))).toBe(false);
  });

  it("counts a two-leg reaction from the section's top, not from its lower bounce (item 6 second review F1)", () => {
    // 120 down to 110, a 5-day bounce to 113 (under the weekly chart's week), then new lows to day 70 from the top.
    const twoLeg = daily([...CAMPAIGN, ...leg(120, 110, 30), ...leg(110, 113, 5), ...leg(113, 106, 35)]);
    expect(buildCampaignLedger(twoLeg)!.counterMoveThirdMonth).toBe(true);
    expect(readGannTrend(twoLeg).changing).toBe(true);
  });

  it("counts from the section's top when a bounce of a week or more inside the reaction makes a lower weekly top (item 7 review H1)", () => {
    // 120 down to 110 in 20 days, a 10-day bounce to 115, then a drift that holds above 110.
    const lowerTop = [...CAMPAIGN, ...leg(120, 110, 20), ...leg(110, 115, 10), ...leg(115, 111, 62)];
    const ledger = buildCampaignLedger(daily(lowerTop))!;
    expect(ledger.counterMoveThirdMonth).toBe(false);
    expect(ledger.reactionBelowPriorSection).toBe(false);
    expect(readGannTrend(daily(lowerTop)).changing).toBe(false);
    // The same with the 3-day swings stepping up again reads the trend up.
    const resumed = [...lowerTop, ...leg(111, 114, 6), ...leg(114, 112, 4), ...leg(112, 114.5, 5), ...leg(114.5, 113, 3)];
    expect(readGannTrend(daily(resumed)).direction).toBe("bullish");
    // New lows under that weekly bottom turn the weekly chart down first (its own rule), so the trend is no longer up.
    const newLows = daily([...CAMPAIGN, ...leg(120, 110, 20), ...leg(110, 115, 10), ...leg(115, 106, 45)]);
    expect(readGannTrend(newLows).weekly).toBe("bearish");
    expect(readGannTrend(newLows).direction).not.toBe("bullish");
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

  it("counts from the section's bottom when a dip of a week or more makes a higher weekly bottom", () => {
    const higherBottom = mirror(daily([...CAMPAIGN, ...leg(120, 110, 20), ...leg(110, 115, 10), ...leg(115, 111, 62)]));
    const ledger = buildCampaignLedger(higherBottom)!;
    expect(ledger.trend).toBe("bearish");
    expect(ledger.counterMoveThirdMonth).toBe(false);
    expect(ledger.reactionBelowPriorSection).toBe(false);
    expect(readGannTrend(higherBottom).changing).toBe(false);
  });
});
