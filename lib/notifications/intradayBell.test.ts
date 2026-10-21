import { describe, expect, it } from "vitest";
import type { Alert } from "@/lib/scanner/intraday";
import { alertsForTier, buildIntradayBellRow } from "./intradayBell";

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
  const alerts = [alert({ symbol: "SPY" }), alert({ symbol: "TSLA" })];
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
});
