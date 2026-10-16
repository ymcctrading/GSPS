/**
 * A monthly break warns, it does not end the trend (PLAN.md item 6, step 3,
 * on the recommended answer to the owner's card): W006 p.14's 1933 reaction
 * broke monthly lows yet held above the first section's top, and Gann reads
 * the trend as still up (A-TREND-06), while p.41 marks the break as the sign
 * to watch (A-TREND-11). The trend read keeps the direction and carries the
 * warning; a new Execute with the trend is held to Watch while it stands.
 */
import { describe, expect, it } from "vitest";
import type { Bar, ScanDecision } from "@/lib/types";
import { readGannTrend } from "@/lib/gann/trendStrength";
import { buildCampaignLedger, readMonthlyBreakWarning } from "@/lib/gann/campaignLedger";
import { levelRole } from "@/lib/analysis/levelRole";
import { applyMonthlyBreakHold } from "@/lib/scoring/score";

const DAY = 86_400_000;
const leg = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
function daily(closes: number[], half = 0.3): Bar[] {
  const t0 = Date.parse("2025-01-02T05:00:00Z");
  return closes.map((c, i) => ({ t: new Date(t0 + i * DAY).toISOString(), o: c, h: c + half, l: c - half, c, v: 1e6 }));
}
// The 1932-33 shape: up 40 to 81, react to 49.5, up to 110.5, react to 82.5 and turn up.
const SHAPE_1933 = daily([...leg(30, 40, 20), ...leg(40, 81, 60), ...leg(81, 49.5, 50), ...leg(49.5, 110.5, 120), ...leg(110.5, 82.5, 30), ...leg(82.5, 86, 4)]);

describe("a reaction held above the previous section's top (A-TREND-06)", () => {
  it("reads the trend up, with the monthly break as a warning", () => {
    const ledger = buildCampaignLedger(SHAPE_1933)!;
    expect(ledger.monthlyBreak).toBe(true);
    expect(ledger.spaceOverbalanced || ledger.timeOverbalanced).toBe(false);
    const t = readGannTrend(SHAPE_1933);
    expect(t.direction).toBe("bullish");
    expect(t.monthlyWarning).toBe(true);
    expect(levelRole(SHAPE_1933.at(-1)!.c, 81)).toBe("support");
  });
});

// The same campaign with the second reaction taken to 75, under the first section's top of 81.
const BELOW_FIRST_TOP = daily([...leg(30, 40, 20), ...leg(40, 81, 60), ...leg(81, 49.5, 50), ...leg(49.5, 110.5, 120), ...leg(110.5, 75, 30), ...leg(75, 78.5, 4)]);
/** The mirror: a bear campaign, each price reflected about 150. */
const mirror = (bars: Bar[]): Bar[] => bars.map((b) => ({ ...b, o: 300 - b.o, c: 300 - b.c, h: 300 - b.l, l: 300 - b.h }));

describe("a monthly break with the reaction under the previous section's top (item 6 review R2, A-TREND-06)", () => {
  it("ends the trend: no space or time over-balance, yet the trend is no longer confirmed", () => {
    const ledger = buildCampaignLedger(BELOW_FIRST_TOP)!;
    expect(ledger.monthlyBreak).toBe(true);
    expect(ledger.spaceOverbalanced || ledger.timeOverbalanced).toBe(false);
    expect(ledger.reactionBelowPriorSection).toBe(true);
    const t = readGannTrend(BELOW_FIRST_TOP);
    expect(t.changing).toBe(true);
    expect(t.direction).toBeNull();
  });

  it("does not flag the 1933 reaction that held above it", () => {
    expect(buildCampaignLedger(SHAPE_1933)!.reactionBelowPriorSection).toBe(false);
    expect(readGannTrend(SHAPE_1933).changing).toBe(false);
  });

  it("measures against the section just before the last, not the campaign's first", () => {
    // Three sections: tops 81, 110.5 and 140; the last reaction to 105 holds above 81 but not above 110.5.
    const third = daily([...leg(30, 40, 20), ...leg(40, 81, 60), ...leg(81, 49.5, 50), ...leg(49.5, 110.5, 120), ...leg(110.5, 90, 30), ...leg(90, 140, 90), ...leg(140, 105, 30), ...leg(105, 108.5, 4)]);
    const ledger = buildCampaignLedger(third)!;
    expect(ledger.monthlyBreak).toBe(true);
    expect(ledger.spaceOverbalanced || ledger.timeOverbalanced).toBe(false);
    expect(ledger.reactionBelowPriorSection).toBe(true);
    expect(readGannTrend(third).direction).toBeNull();
  });

  // Item 6 second review F4, decided: a reaction that broke a month and went
  // under the previous section's top has changed the trend; a later month that
  // holds does not undo it. Only a new section top (the trend resuming) does.
  it("keeps the trend changed after the months stop breaking, until a new section top", () => {
    const recovered = daily([...leg(30, 40, 20), ...leg(40, 81, 60), ...leg(81, 49.5, 50), ...leg(49.5, 110.5, 120), ...leg(110.5, 75, 30), ...leg(75, 100, 70)]);
    const ledger = buildCampaignLedger(recovered)!;
    expect(ledger.reactionBelowPriorSection).toBe(true);
    expect(ledger.monthlyBreak).toBe(false);
    expect(readGannTrend(recovered).changing).toBe(true);
    const resumed = daily([...leg(30, 40, 20), ...leg(40, 81, 60), ...leg(81, 49.5, 50), ...leg(49.5, 110.5, 120), ...leg(110.5, 75, 30), ...leg(75, 115, 70)]);
    expect(readGannTrend(resumed).changing).toBe(false);
  });

  // Item 6 second review F1: the section tops come from the weekly chart, not
  // every minor 3-day swing. Both shapes hold above the first section's 81, and
  // their bounce and dip are under the weekly chart's week, so it ignores them.
  const FIRST_TWO = [...leg(30, 40, 20), ...leg(40, 81, 60), ...leg(81, 49.5, 50)];
  const TWO_LEG_REACTION = daily([...FIRST_TWO, ...leg(49.5, 110.5, 120), ...leg(110.5, 95, 15), ...leg(95, 100, 5), ...leg(100, 85, 15), ...leg(85, 88, 4)]);
  const DIP_IN_SECTION = daily([...FIRST_TWO, ...leg(49.5, 90, 60), ...leg(90, 86, 6), ...leg(86, 110.5, 60), ...leg(110.5, 84, 30), ...leg(84, 87, 4)]);

  it("measures a two-leg reaction from the section's top, not from its lower bounce", () => {
    const ledger = buildCampaignLedger(TWO_LEG_REACTION)!;
    expect(ledger.monthlyBreak).toBe(true);
    expect(ledger.reactionBelowPriorSection).toBe(false);
    // Not changing: the lower 3-day top still leaves the structure unconfirmed, a separate rule.
    expect(readGannTrend(TWO_LEG_REACTION)).toMatchObject({ weekly: "bullish", changing: false, monthlyWarning: true });
    expect(readGannTrend(mirror(TWO_LEG_REACTION))).toMatchObject({ weekly: "bearish", changing: false, monthlyWarning: true });
  });

  it("reads the previous section's top past a minor dip inside the section", () => {
    const ledger = buildCampaignLedger(DIP_IN_SECTION)!;
    expect(ledger.monthlyBreak).toBe(true);
    expect(ledger.reactionBelowPriorSection).toBe(false);
    expect(readGannTrend(DIP_IN_SECTION)).toMatchObject({ weekly: "bullish", changing: false, monthlyWarning: true });
    expect(readGannTrend(mirror(DIP_IN_SECTION))).toMatchObject({ weekly: "bearish", changing: false, monthlyWarning: true });
  });

  it("reads the mirror the same way in a bear campaign", () => {
    expect(readGannTrend(mirror(SHAPE_1933))).toMatchObject({ direction: "bearish", changing: false, monthlyWarning: true });
    const below = buildCampaignLedger(mirror(BELOW_FIRST_TOP))!;
    expect(below).toMatchObject({ trend: "bearish", monthlyBreak: true, reactionBelowPriorSection: true });
    expect(readGannTrend(mirror(BELOW_FIRST_TOP)).direction).toBeNull();
  });
});

describe("applyMonthlyBreakHold", () => {
  const execute = { outputState: "Execute", breakdown: [] } as unknown as ScanDecision;
  const warning = readMonthlyBreakWarning(SHAPE_1933)!;

  it("holds a new Execute with the trend to Watch while the month has broken the last one's low", () => {
    expect(warning).toMatchObject({ trend: "bullish", monthlyBreak: true });
    const held = applyMonthlyBreakHold(execute, warning, "bullish");
    expect(held.outputState).toBe("Watch");
    expect(held.breakdown.at(-1)?.key).toBe("monthlyBreak");
  });

  it("leaves a trade against the trend, a month that held, and a Watch alone", () => {
    expect(applyMonthlyBreakHold(execute, warning, "bearish")).toBe(execute);
    expect(applyMonthlyBreakHold(execute, { ...warning, monthlyBreak: false }, "bullish")).toBe(execute);
    expect(applyMonthlyBreakHold(execute, null, "bullish")).toBe(execute);
    const watch = { ...execute, outputState: "Watch" } as ScanDecision;
    expect(applyMonthlyBreakHold(watch, warning, "bullish")).toBe(watch);
  });
});
