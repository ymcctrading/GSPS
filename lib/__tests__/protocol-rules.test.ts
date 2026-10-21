/**
 * The Settings page used to advertise a 2:1 first target and a 3:1 master
 * target. The engine has never priced either. These tie the copy to the
 * constants the engine computes with, so the two cannot drift apart again —
 * and they matter more now than they did, because Guided Decision Mode turns
 * the same numbers into a dollar figure the user reads instead of the levels.
 */

import { describe, expect, it } from "vitest";
import {
  computeTradeLevels,
  EQUITY_MASTER_CAP_PCT,
  EQUITY_TP1_MAX_PCT,
  EQUITY_TP1_MIN_PCT,
  EQUITY_TP2_MAX_PCT,
  EQUITY_TP2_MIN_PCT,
  TP1_MULTIPLE_BY_ASSET,
  TP2_MULTIPLE_BY_ASSET,
} from "@/lib/strat/levels";
import { EXECUTE_SCORE_THRESHOLD, TOTAL_POINTS } from "@/lib/scoring/weights";
import {
  EXECUTE_RULE_DETAIL,
  EXECUTE_RULE_LABEL,
  MASTER_RULE_DETAIL,
  MASTER_RULE_LABEL,
  STOP_RULE_DETAIL,
  TP1_RULE_DETAIL,
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
  // 2026-09-11: equities moved to a percent-of-price model (no computed risk
  // to express an R-multiple against — see lib/strat/levels.ts's own
  // comment), so these two now check the equity model's own claim against
  // the constants it's generated from, rather than an R-multiple. Crypto
  // still prices a fixed R-multiple; that half of each label is unchanged.
  it("prices the stock TP1 inside the percentage range the copy names", () => {
    const levels = computeTradeLevels(pattern, previousBar, [], undefined, undefined, "us_equity");
    const targetPct = (Math.abs(levels.takeProfit1 - levels.entry) / levels.entry) * 100;
    expect(targetPct).toBeGreaterThanOrEqual(EQUITY_TP1_MIN_PCT);
    expect(targetPct).toBeLessThanOrEqual(EQUITY_TP1_MAX_PCT);
    expect(TP1_RULE_LABEL).toContain(`${EQUITY_TP1_MIN_PCT}`);
    expect(TP1_RULE_LABEL).toContain(`${EQUITY_TP1_MAX_PCT}`);
    expect(TP1_RULE_LABEL).toContain(String(TP1_MULTIPLE_BY_ASSET.crypto));
    // The fixed-R claim that was on the Settings page for a year, now wrong
    // for a different reason (equities don't price an R-multiple at all).
    expect(levels.rewardToRiskTp1).not.toBe(2);
  });

  it("prices the stock master target inside the percentage range the copy names", () => {
    const levels = computeTradeLevels(pattern, previousBar, [], undefined, undefined, "us_equity");
    const targetPct = (Math.abs(levels.takeProfit2 - levels.entry) / levels.entry) * 100;
    expect(targetPct).toBeGreaterThanOrEqual(EQUITY_TP2_MIN_PCT);
    expect(targetPct).toBeLessThanOrEqual(EQUITY_TP2_MAX_PCT);
    expect(MASTER_RULE_DETAIL).toContain(`${EQUITY_TP2_MIN_PCT}`);
    expect(MASTER_RULE_DETAIL).toContain(`${EQUITY_TP2_MAX_PCT}`);
    expect(MASTER_RULE_LABEL).toContain(`${EQUITY_MASTER_CAP_PCT}`);
    expect(MASTER_RULE_LABEL).toContain(String(TP2_MULTIPLE_BY_ASSET.crypto));
  });

  // R-007 (2026-10-21): since Q14 nothing sells at a fixed target, and the
  // equity TP1 is the first level past the risk, not a percent of entry.
  it("says the targets are levels, not exits", () => {
    expect(TP1_RULE_LABEL).toMatch(/pays more than the risk/);
    expect(TP1_RULE_DETAIL).toMatch(/Nothing is sold there/);
    expect(MASTER_RULE_DETAIL).toMatch(/Nothing is sold there/);
    expect(TP1_RULE_DETAIL).not.toMatch(/of entry price, scaled/);
  });

  it("says the 12–18% band is about option premium, not share price", () => {
    expect(STOP_RULE_DETAIL).toContain("option premium");
  });

  it("states every condition that can hold a setup at the cutoff below Execute", () => {
    expect(EXECUTE_RULE_LABEL).toContain(`${EXECUTE_SCORE_THRESHOLD}`);
    expect(EXECUTE_RULE_LABEL).toContain(`${TOTAL_POINTS}`);
    expect(EXECUTE_RULE_DETAIL).toMatch(/trade plan/);
    expect(EXECUTE_RULE_DETAIL).toMatch(/broken out of it/);
    expect(EXECUTE_RULE_DETAIL).toMatch(/month/);
    expect(EXECUTE_RULE_DETAIL).toMatch(/distribution/);
    expect(EXECUTE_RULE_DETAIL).toMatch(/failed top/);
    expect(EXECUTE_RULE_DETAIL).toMatch(/behind the market/);
    // No bar-sequence pattern holds a verdict since 2026-10-16 (N#1).
    expect(EXECUTE_RULE_DETAIL).not.toMatch(/pattern|failed-push/);
  });
});
