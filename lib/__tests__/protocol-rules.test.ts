/**
 * The Settings page used to advertise a 2:1 first target and a 3:1 master
 * target. The engine has never priced either. These tie the copy to the
 * constants the engine computes with, so the two cannot drift apart again —
 * and they matter more now than they did, because Guided Decision Mode turns
 * the same numbers into a dollar figure the user reads instead of the levels.
 */

import { describe, expect, it } from "vitest";
import { computeTradeLevels, TP1_MULTIPLE_BY_ASSET, TP2_MULTIPLE_BY_ASSET } from "@/lib/strat/levels";
import {
  EXECUTE_RULE_DETAIL,
  MASTER_RULE_LABEL,
  STOP_RULE_DETAIL,
  TP1_RULE_LABEL,
} from "@/lib/trade/protocol-rules";
import type { Bar, StratPattern } from "@/lib/types";

const pattern: StratPattern = {
  name: "2-1-2",
  direction: "bullish",
  triggerPrice: 100,
  stopPrice: 98,
  description: "",
};

/** A previous candle whose extreme is nowhere near the target, so the multiple decides. */
const previousBar: Bar = { t: "2026-08-17T00:00:00Z", o: 99, h: 99.5, l: 98.5, c: 99, v: 1_000 };

describe("the advertised targets match the priced ones", () => {
  it("prices TP1 at the multiple the copy names", () => {
    const levels = computeTradeLevels(pattern, previousBar, [], undefined, undefined, "us_equity");
    expect(levels.rewardToRiskTp1).toBeCloseTo(TP1_MULTIPLE_BY_ASSET.us_equity, 6);
    expect(TP1_RULE_LABEL).toContain(String(TP1_MULTIPLE_BY_ASSET.us_equity));
    // The claim that was on the Settings page for a year.
    expect(levels.rewardToRiskTp1).not.toBe(2);
  });

  it("prices the master target at the runner multiple the copy names", () => {
    const levels = computeTradeLevels(pattern, previousBar, [], undefined, undefined, "us_equity");
    expect(levels.rewardToRiskMaster).toBeCloseTo(TP2_MULTIPLE_BY_ASSET.us_equity, 6);
    expect(MASTER_RULE_LABEL).toContain(String(TP2_MULTIPLE_BY_ASSET.us_equity));
    expect(MASTER_RULE_LABEL).toContain(String(TP2_MULTIPLE_BY_ASSET.crypto));
  });

  it("says the 12–18% band is about option premium, not share price", () => {
    expect(STOP_RULE_DETAIL).toContain("option premium");
  });

  it("states every condition that can hold a 7-scored setup below Execute", () => {
    expect(EXECUTE_RULE_DETAIL).toMatch(/trade plan/);
    expect(EXECUTE_RULE_DETAIL).toMatch(/2-2/);
    expect(EXECUTE_RULE_DETAIL).toMatch(/behind the market/);
  });
});
