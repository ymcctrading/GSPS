/**
 * Guided Mode's room under Gann's capital rules (Q12, owner 2026-10-16): at
 * most five stocks open (A-RISK-08, never-failing rule 8) and 30 points of capital behind every
 * share held (A-RISK-01). The retired trade-count and deployed-percent caps
 * are pinned as gone.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { readCapUsage } from "@/lib/guided/caps";
import { capitalPerShare } from "@/lib/risk/gannCapital";

describe("readCapUsage", () => {
  it("reports nothing held and no block on an empty account", () => {
    expect(readCapUsage(new Map())).toEqual({ openMarkets: [], capitalHeldUsd: 0, blockedReason: null });
  });

  it("holds the rule's capital behind every open share, at the price it was opened at", () => {
    const usage = readCapUsage(new Map([["AAPL", { qty: 10, avgEntry: 200 }], ["XOM", { qty: 5, avgEntry: 100 }]]));
    expect(usage.capitalHeldUsd).toBeCloseTo(10 * capitalPerShare(200) + 5 * capitalPerShare(100), 6);
    expect(usage.blockedReason).toBeNull();
  });

  it("blocks a new stock once five are open, and does not count crypto pairs", () => {
    const four = ["AAPL", "MSFT", "XOM", "JPM"].map((s) => [s, { qty: 1, avgEntry: 50 }] as const);
    expect(readCapUsage(new Map([...four, ["BTC/USD", { qty: 1, avgEntry: 50 }]])).blockedReason).toBeNull();
    const usage = readCapUsage(new Map([...four, ["KO", { qty: 1, avgEntry: 50 }]]));
    expect(usage.openMarkets).toEqual(["AAPL", "MSFT", "XOM", "JPM", "KO"]);
    expect(usage.blockedReason).toContain("at most 5");
  });

  it("leaves option legs out, as the order path does", () => {
    const open = new Map([["AAPL", { qty: 1, avgEntry: 50 }], ["AAPL250117C00150000", { qty: 1, avgEntry: 5 }]]);
    expect(readCapUsage(open).openMarkets).toEqual(["AAPL"]);
  });

  it("counts no trades a day or a week any more (Q8, Q12)", () => {
    for (const f of ["lib/guided/caps.ts", "lib/guided/config.ts", "lib/demo/auto-trade.ts"]) {
      expect(fs.readFileSync(f, "utf8")).not.toMatch(/maxTradesPerDay|tradesToday|maxDeployedPct|budgetUsd/);
    }
  });
});
