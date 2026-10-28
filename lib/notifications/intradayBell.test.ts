import { describe, expect, it } from "vitest";
import type { Alert } from "@/lib/scanner/intraday";
import { alertsForTier, buildIntradayBellRow, isNoticeTitle } from "./intradayBell";

function alert(over: Partial<Alert> = {}): Alert {
  return {
    symbol: "SPY",
    type: "plan_level_held",
    direction: "up",
    move: { current: 770.12 },
    invalidation: 744.12,
    continuationPlan: { firstTarget: 795.76, masterTarget: 822.83, paysRisk: true },
    ...over,
  } as unknown as Alert;
}

describe("buildIntradayBellRow", () => {
  it("names the symbol, side and signal, with the plan's levels", () => {
    const row = buildIntradayBellRow(alert());
    expect(row.verdict).toBe("Intraday");
    expect(row.title).toBe("SPY intraday, up: Daily plan's level held");
    expect(row.body).toContain("Price 770.12, stop 744.12, TP1 795.76, MTP 822.83.");
    expect(row.body).toContain("no measured record yet");
  });

  it("says when no target is fixed and when the target does not pay the risk", () => {
    const none = buildIntradayBellRow(
      alert({ direction: "down", continuationPlan: { firstTarget: null, paysRisk: null } as Alert["continuationPlan"] }),
    );
    expect(none.title).toContain("intraday, down");
    expect(none.body).toContain("no target fixed, the stop trails");
    const short = buildIntradayBellRow(
      alert({ continuationPlan: { firstTarget: 771, paysRisk: false } as Alert["continuationPlan"] }),
    );
    expect(short.body).toContain("No trade here");
  });
});

describe("alertsForTier", () => {
  const alerts = [alert({ symbol: "SPY", type: "old_level_cross" }), alert({ symbol: "TSLA", type: "old_level_cross" })];
  const intervals = new Map([
    ["SPY", 15],
    ["TSLA", 1],
  ]);

  it("passes everything with full intraday access and nothing without any", () => {
    expect(alertsForTier(alerts, { intradayScansEnabled: true, proIntradayModuleEnabled: false }, intervals)).toHaveLength(2);
    expect(alertsForTier(alerts, { intradayScansEnabled: false, proIntradayModuleEnabled: false }, intervals)).toHaveLength(0);
  });

  it("gives Pro's bounded module its confirmed entries only", () => {
    const pro = alertsForTier(alerts, { intradayScansEnabled: false, proIntradayModuleEnabled: true }, intervals);
    expect(pro.map((a) => a.symbol)).toEqual(["SPY"]);
  });

  it("lets Pro's module through a notice whatever its bar length: a notice is not a setup", () => {
    const pro = alertsForTier(
      [alert({ symbol: "TSLA", type: "entry_approach" })],
      { intradayScansEnabled: false, proIntradayModuleEnabled: true },
      intervals,
    );
    expect(pro).toHaveLength(1);
  });

  it("sends no one a signal the replay measured losing (run 80, plan_level_held)", () => {
    const held = [alert({ symbol: "SPY" }), alert({ symbol: "TSLA", type: "old_level_cross" })];
    const out = alertsForTier(held, { intradayScansEnabled: true, proIntradayModuleEnabled: false }, intervals);
    expect(out.map((a) => a.type)).toEqual(["old_level_cross"]);
  });
});

describe("buildIntradayBellRow: notices", () => {
  it("words a heads-up with the time left and the daily plan's entry, never a session trade", () => {
    const row = buildIntradayBellRow(
      alert({
        symbol: "LLY",
        type: "entry_approach",
        move: { current: 504 } as Alert["move"],
        invalidation: 497,
        continuationPlan: { entry: 501, firstTarget: 512, masterTarget: 520, paysRisk: true } as Alert["continuationPlan"],
        approach: { entry: 501, distance: 3, ratePerBar: 0.1, etaMinutes: 22.4, expectedAt: "2026-10-27T14:42:00Z" },
      }),
    );
    expect(row.title).toBe("LLY buy: Nearing the plan's entry");
    expect(row.body).toContain("About 22 minutes away");
    expect(row.body).toContain("Daily plan: entry 501.00, stop 497.00, TP1 512.00, MTP 520.00.");
  });
});

describe("isNoticeTitle", () => {
  it("tells a notice's bell title from a signal's, so a notice takes none of Pro's daily bound", () => {
    expect(isNoticeTitle("LLY buy: Nearing the plan's entry")).toBe(true);
    expect(isNoticeTitle("LLY sell: At the plan's entry")).toBe(true);
    expect(isNoticeTitle("SPY intraday, up: Daily plan's level held")).toBe(false);
  });
});
