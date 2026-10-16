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
