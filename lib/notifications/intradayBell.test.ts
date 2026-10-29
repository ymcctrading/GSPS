import { describe, expect, it } from "vitest";
import type { Alert } from "@/lib/scanner/intraday";
import { alertsForTier, buildIntradayBellRow, isNoticeTitle, type DeliverableFreshness } from "./intradayBell";
import { alertTimeliness } from "@/lib/__tests__/fixtures/alertTimeliness";

// 10:30 ET on 2026-10-27 (EDT): the 10:15-10:30 candle, evaluated at 10:45.
const AS_OF = "2026-10-27T14:30:00.000Z";
const EVALUATED = new Date("2026-10-27T14:45:00.000Z");
const actionable: DeliverableFreshness = {
  disposition: "actionable",
  reason: "current_authorization",
  dataAsOf: AS_OF,
  checkedAt: "2026-10-27T14:45:05.000Z",
  authorizationId: "auth",
};
const delayed: DeliverableFreshness = {
  disposition: "informational",
  reason: "delayed_observation",
  dataAsOf: AS_OF,
  checkedAt: "2026-10-27T14:45:05.000Z",
};

function alert(over: Partial<Alert> = {}): Alert {
  return {
    symbol: "SPY",
    type: "plan_level_held",
    direction: "up",
    move: { current: 770.12 },
    invalidation: 744.12,
    continuationPlan: { firstTarget: 795.76, masterTarget: 822.83, paysRisk: true },
    timeliness: alertTimeliness(EVALUATED),
    ...over,
  } as unknown as Alert;
}

describe("buildIntradayBellRow", () => {
  it("names the symbol, side and signal, with the plan's levels", () => {
    const row = buildIntradayBellRow(alert(), actionable);
    expect(row.verdict).toBe("Intraday");
    expect(row.title).toBe("SPY intraday, up: Daily plan's level held");
    expect(row.body).toContain("Price 770.12, stop 744.12, TP1 795.76, MTP 822.83.");
    expect(row.body).toContain("no measured record yet");
  });

  it("says when no target is fixed and when the target does not pay the risk", () => {
    const none = buildIntradayBellRow(
      alert({ direction: "down", continuationPlan: { firstTarget: null, paysRisk: null } as Alert["continuationPlan"] }),
      actionable,
    );
    expect(none.title).toContain("intraday, down");
    expect(none.body).toContain("no target fixed, the stop trails");
    const short = buildIntradayBellRow(
      alert({ continuationPlan: { firstTarget: 771, paysRisk: false } as Alert["continuationPlan"] }),
      delayed,
    );
    expect(short.body).toContain("No trade here");
  });
});

describe("buildIntradayBellRow: a reversal-risk warning", () => {
  it("is worded as a warning to stand aside, with no stop or target", () => {
    for (const f of [actionable, delayed]) {
      const row = buildIntradayBellRow(alert({ type: "reversal_risk", direction: "down" }), f);
      expect(row.title).toBe("SPY intraday, down: Reversal risk");
      expect(row.body).toContain("A warning, not a trade");
      expect(row.body).not.toMatch(/stop|TP1|MTP/);
    }
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

  it("sends no one a signal whose stop sits inside one intraday point", () => {
    const held = [alert({ symbol: "SPY", type: "trend_continuation", riskUnderPoint: true }), alert({ symbol: "TSLA", type: "old_level_cross" })];
    const out = alertsForTier(held, { intradayScansEnabled: true, proIntradayModuleEnabled: false }, intervals);
    expect(out.map((a) => a.symbol)).toEqual(["TSLA"]);
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
      actionable,
    );
    expect(row.title).toBe("LLY buy: Nearing the plan's entry");
    expect(row.body).toContain("About 22 minutes away");
    expect(row.body).toContain("Daily plan: entry 501.00, stop 497.00, TP1 512.00, MTP 520.00.");
  });
});

describe("buildIntradayBellRow: delayed data (NOTIFY-FRESHNESS-001)", () => {
  const notice = (type: Alert["type"]) =>
    alert({
      symbol: "LLY",
      type,
      move: { current: 501.2 } as Alert["move"],
      invalidation: 497,
      continuationPlan: { entry: 501, firstTarget: 512, masterTarget: 520, paysRisk: true } as Alert["continuationPlan"],
      approach: { entry: 501, distance: 3, ratePerBar: 0.1, etaMinutes: 5, expectedAt: "2026-10-27T14:50:00Z" },
    });
  const forbidden = [/\bnow\b/i, /buy now/i, /minutes? away/i, /until entry/i, /\bExecute\b/];

  it("an entry reached on delayed data names the candle and the delay, never 'now'", () => {
    const row = buildIntradayBellRow(notice("entry_reached"), delayed);
    expect(row.title).toBe("LLY buy: At the plan's entry");
    expect(row.body).toContain(
      "Delayed observation: price reached the entry in the 10:15–10:30 AM ET candle. Equity data is delayed by 15 minutes. Current entry status has not been verified.",
    );
    for (const re of forbidden) expect(row.body).not.toMatch(re);
  });

  it("a delayed approach is an estimate from data through a time, not an arrival time", () => {
    const row = buildIntradayBellRow(notice("entry_approach"), delayed);
    expect(row.title).toBe("LLY buy: Nearing the plan's entry");
    expect(row.body).toContain(
      "Based on data through 10:30 AM ET, price was moving toward the entry. This is an estimate from delayed observations, not a live arrival time.",
    );
    for (const re of forbidden) expect(row.body).not.toMatch(re);
  });

  it("a delayed signal says what the data is as of and that status is unverified", () => {
    const row = buildIntradayBellRow(alert({ type: "old_level_cross" }), delayed);
    expect(row.title).toBe("SPY intraday, up: " + row.title.split(": ")[1]);
    expect(row.body).toMatch(/^Based on data through 10:30 AM ET: Price 770\.12/);
    expect(row.body).toContain("Equity data is delayed by 15 minutes. Current status has not been verified.");
    for (const re of forbidden) expect(row.body).not.toMatch(re);
  });

  it("the title is the same whatever the disposition, so deduplication still reads it", () => {
    for (const type of ["entry_reached", "entry_approach"] as const) {
      expect(buildIntradayBellRow(notice(type), delayed).title).toBe(buildIntradayBellRow(notice(type), actionable).title);
    }
  });

  it("a held entry says there is no trade on it", () => {
    const row = buildIntradayBellRow(notice("entry_reached"), { ...delayed, reason: "entry_held" });
    expect(row.body).toContain("This plan is held, so there is no trade to take on it.");
  });

  it("only an actionable disposition says the price is at the entry now", () => {
    expect(buildIntradayBellRow(notice("entry_reached"), actionable).body).toContain("Price is at the entry now");
    expect(buildIntradayBellRow(notice("entry_approach"), actionable).body).toContain("About 5 minutes away");
  });
});

describe("isNoticeTitle", () => {
  it("tells a notice's bell title from a signal's, so a notice takes none of Pro's daily bound", () => {
    expect(isNoticeTitle("LLY buy: Nearing the plan's entry")).toBe(true);
    expect(isNoticeTitle("LLY sell: At the plan's entry")).toBe(true);
    expect(isNoticeTitle("SPY intraday, up: Daily plan's level held")).toBe(false);
  });
});
