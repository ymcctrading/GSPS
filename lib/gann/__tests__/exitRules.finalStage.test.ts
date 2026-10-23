import { describe, expect, it, vi } from "vitest";
import type { Bar } from "@/lib/types";

// M-R11: the final stage starts at the campaign's 3rd section. The ledger is
// stubbed so the section count is the only thing that differs between cases.
const ledgerState = { sections: 3 };
vi.mock("@/lib/gann/campaignLedger", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/gann/campaignLedger")>();
  return {
    ...actual,
    buildCampaignLedger: (daily: Bar[]) => ({
      trend: "bullish",
      campaignStartDate: daily[0]?.t.slice(0, 10) ?? "2026-01-01",
      sections: ledgerState.sections,
      // The last counter-move was 0.5%, so the final-stage stop sits 0.5% under the best price.
      legs: [{ direction: "down", fromIndex: 0, toIndex: 1, pct: 0.5, days: 2 }],
      greatestCounterMove: null,
      currentCounterMove: null,
      spaceOverbalanced: false,
      timeOverbalanced: false,
      spaceOverbalancedByPoint: false,
      counterMoveThirdMonth: false,
      sectionTopDate: daily[0]?.t.slice(0, 10) ?? "2026-01-01",
      monthlyBreak: false,
      monthlyBreakFirst: false,
      reactionBelowPriorSection: false,
      monthlyBreakInReaction: false,
    }),
  };
});

const { readGannExit, FINAL_STAGE_SECTION } = await import("../exitRules");
const { gannThreePoints } = await import("../pointScale");

function daily(closes: number[]): Bar[] {
  return closes.map((c, i) => ({
    t: new Date(Date.UTC(2026, 0, 5) + i * 86_400_000).toISOString(),
    o: c,
    h: c + 0.5,
    l: c - 0.5,
    c,
    v: 1000,
  }));
}

describe("readGannExit: the final stage of a campaign (M-R11)", () => {
  // A steady rise inside one week: no swing bottom, no prior week or month,
  // so only break-even and the final stage can move the stop.
  const bars = daily([100, 101, 102, 103, 104]);
  const pos = { side: "long" as const, entry: 102, initialStop: 97, entryDate: bars[2].t.slice(0, 10), crossedLevel: null };

  it("tightens to the final-stage stop in the 3rd section", () => {
    expect(FINAL_STAGE_SECTION).toBe(3);
    ledgerState.sections = 3;
    const best = 102 + gannThreePoints(102) + 1;
    const r = readGannExit(pos, bars, best);
    expect(r.stopReason).toBe("final_stage");
    expect(r.stop).toBeCloseTo(best * 0.995, 6);
  });

  it("leaves the initial stop until the trade has advanced 3 points (W006 p.46: the trail follows an advance)", () => {
    ledgerState.sections = 3;
    const notYet = 102 + gannThreePoints(102) * 0.9;
    const r = readGannExit(pos, bars, notYet);
    expect(r.stopReason).toBe("initial");
    expect(r.stop).toBe(97);
  });

  it("does not apply the final stage in the 2nd section", () => {
    ledgerState.sections = 2;
    const r = readGannExit(pos, bars, 104.5);
    expect(r.stopReason).not.toBe("final_stage");
  });
});
