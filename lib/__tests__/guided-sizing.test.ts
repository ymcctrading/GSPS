/**
 * The share count and the dollar figures on a guided card. These are the
 * numbers a user reads *instead of* the levels, so an error here is invisible
 * to them by design.
 */

import { describe, expect, it } from "vitest";
import { sizeGuidedTrade } from "@/lib/guided/sizing";
import { MIN_GUIDED_QTY } from "@/lib/guided/config";

/** Entry 100, stop 90, first target 1.5R, master 2.5R — $10 of risk a share. */
const base = {
  side: "buy" as const,
  equity: 100_000,
  buyingPower: 100_000,
  entry: 100,
  stopLoss: 90,
  takeProfit1: 115,
  masterProfit: 125,
  riskPct: 1,
  maxDeployedPct: 25,
  deployedUsd: 0,
};

describe("sizeGuidedTrade", () => {
  it("sizes from the risk cap and the entry-to-stop distance, not from equity alone", () => {
    // 1% of 100k = $1,000 of risk, $10 a share → 100 shares.
    const sized = sizeGuidedTrade(base);
    expect(sized.qty).toBe(100);
    expect(sized.riskUsd).toBeCloseTo(1000, 6);
    expect(sized.boundBy).toBe("risk");
  });

  it("states the reward the staged exit actually produces, not qty × (target − entry)", () => {
    const sized = sizeGuidedTrade(base);
    // 60 shares out at 115, the remaining 40 at 125.
    expect(sized.rewardUsd).toBeCloseTo(60 * 15 + 40 * 25, 6);
    // The naive figure would be 100 × 25 = 2,500, which nothing about this
    // trade would ever pay.
    expect(sized.rewardUsd).not.toBeCloseTo(2500, 6);
  });

  it("reports the partial outcome where only the first target fills", () => {
    expect(sizeGuidedTrade(base).rewardAtTp1Usd).toBeCloseTo(60 * 15, 6);
  });

  it("lets the portfolio cap bind when a tight stop implies a large position", () => {
    // A 2% stop at 1% risk implies a position worth half the account, which is
    // twice what Guided Mode may commit — so the deployed-capital cap, not the
    // risk cap, is what decides the size.
    const sized = sizeGuidedTrade({ ...base, stopLoss: 98, takeProfit1: 103, masterProfit: 105 });
    expect(sized.qty).toBe(250); // 25% of 100k ÷ $100
    expect(sized.boundBy).toBe("portfolio");
    expect(sized.riskUsd).toBeLessThan(base.equity * (base.riskPct / 100));
  });

  it("shrinks as capital already deployed through Guided Mode rises", () => {
    // $1,000 of headroom left under the 25% cap → 10 shares.
    const sized = sizeGuidedTrade({ ...base, stopLoss: 98, deployedUsd: 24_000 });
    expect(sized.qty).toBe(10);
    expect(sized.boundBy).toBe("portfolio");
  });

  it("is bounded by cash when the account cannot pay for the risk-sized position", () => {
    const sized = sizeGuidedTrade({ ...base, buyingPower: 2_500 });
    expect(sized.qty).toBe(25);
    expect(sized.boundBy).toBe("buying_power");
  });

  it("refuses a trade too small for the protocol's staged exit", () => {
    // $15 of risk budget against $10 a share — one share, which cannot scale out.
    const sized = sizeGuidedTrade({ ...base, equity: 1_500, buyingPower: 1_500 });
    expect(sized.qty).toBe(0);
    expect(sized.blockedReason).toContain(`${MIN_GUIDED_QTY}`);
  });

  it("says the room is spent when the portfolio cap is already full", () => {
    const sized = sizeGuidedTrade({ ...base, deployedUsd: 25_000 });
    expect(sized.qty).toBe(0);
    expect(sized.blockedReason).toContain("Close a guided position");
  });

  it("does not tell a user with nothing deployed to close a position", () => {
    const sized = sizeGuidedTrade({ ...base, equity: 300, buyingPower: 300 });
    expect(sized.qty).toBe(0);
    expect(sized.blockedReason).not.toContain("Close a guided position");
  });

  it("refuses a setup with no distance between entry and stop", () => {
    const sized = sizeGuidedTrade({ ...base, stopLoss: 100 });
    expect(sized.qty).toBe(0);
    expect(sized.blockedReason).toContain("no usable distance");
  });

  it("never risks more than the cap, however wide the stop", () => {
    const sized = sizeGuidedTrade({ ...base, stopLoss: 40 });
    expect(sized.riskUsd).toBeLessThanOrEqual(base.equity * (base.riskPct / 100));
  });

  it("lets the budget cap bind before the risk math ever gets to size the trade", () => {
    // 100 shares at 1% risk (see the first test), but a $250 budget at a $100
    // entry only reaches 2 shares — the novice ceiling, not the paper-equity one.
    const sized = sizeGuidedTrade({ ...base, maxNotionalUsd: 250 });
    expect(sized.qty).toBe(2);
    expect(sized.boundBy).toBe("budget");
    expect(sized.notionalUsd).toBeCloseTo(200, 6);
  });

  it("is unaffected by a budget cap wider than what the other ceilings would size anyway", () => {
    const sized = sizeGuidedTrade({ ...base, maxNotionalUsd: 1_000_000 });
    expect(sized.qty).toBe(100);
    expect(sized.boundBy).toBe("risk");
  });

  it("refuses a symbol whose share price alone exceeds the budget", () => {
    // $250 budget against a $300 entry can't buy even one share.
    const sized = sizeGuidedTrade({ ...base, entry: 300, maxNotionalUsd: 250 });
    expect(sized.qty).toBe(0);
    expect(sized.boundBy).toBe("budget");
    expect(sized.blockedReason).toContain("per-trade budget");
  });

  it("ignores the budget ceiling entirely when it is null", () => {
    const sized = sizeGuidedTrade({ ...base, maxNotionalUsd: null });
    expect(sized.qty).toBe(100);
    expect(sized.boundBy).toBe("risk");
  });
});

/**
 * The mirror image: entry 100, stop 110, first target 85, master 75. Same $10
 * of risk a share, same 1.5R/2.5R geometry, every price relationship inverted.
 * A sign error anywhere in the sizing arithmetic shows up here and nowhere else.
 */
const short = { ...base, side: "sell" as const, stopLoss: 110, takeProfit1: 85, masterProfit: 75 };

describe("sizeGuidedTrade — shorts", () => {
  it("reads risk per share off a stop that sits above the entry", () => {
    const sized = sizeGuidedTrade(short);
    expect(sized.qty).toBe(100); // $1,000 of risk ÷ $10 a share
    expect(sized.riskUsd).toBeCloseTo(1000, 6);
  });

  it("counts a falling price as the reward, not as a loss", () => {
    const sized = sizeGuidedTrade(short);
    // 60 shares covered at 85, the remaining 40 at 75.
    expect(sized.rewardUsd).toBeCloseTo(60 * 15 + 40 * 25, 6);
    expect(sized.rewardUsd).toBeGreaterThan(0);
  });

  it("produces the same numbers as the equivalent long, mirrored", () => {
    const long = sizeGuidedTrade(base);
    const sold = sizeGuidedTrade(short);
    expect(sold.qty).toBe(long.qty);
    expect(sold.riskUsd).toBeCloseTo(long.riskUsd, 6);
    expect(sold.rewardUsd).toBeCloseTo(long.rewardUsd, 6);
    expect(sold.rewardToRisk).toBeCloseTo(long.rewardToRisk, 6);
  });

  it("refuses a short whose stop sits below its entry — that is a long's geometry", () => {
    const sized = sizeGuidedTrade({ ...short, stopLoss: 90 });
    expect(sized.qty).toBe(0);
    expect(sized.blockedReason).toContain("no usable distance");
  });

  it("is not bounded by cash, because a short credits it rather than spending it", () => {
    // The same account with no cash at all still sizes the short, because
    // shorting does not consume buying power in this simulator.
    const sized = sizeGuidedTrade({ ...short, buyingPower: 0 });
    expect(sized.qty).toBe(100);
    expect(sized.boundBy).toBe("risk");
    // The long is refused on the identical account, which is the whole point of
    // the distinction.
    expect(sizeGuidedTrade({ ...base, buyingPower: 0 }).qty).toBe(0);
  });

  it("is still bounded by the deployed-capital cap, which is a short's only ceiling", () => {
    const sized = sizeGuidedTrade({ ...short, deployedUsd: 24_000 });
    expect(sized.qty).toBe(10); // $1,000 of headroom ÷ $100
    expect(sized.boundBy).toBe("portfolio");
  });

  it("never risks more than the cap on a wide short stop", () => {
    const sized = sizeGuidedTrade({ ...short, stopLoss: 160 });
    expect(sized.riskUsd).toBeLessThanOrEqual(short.equity * (short.riskPct / 100));
  });
});
