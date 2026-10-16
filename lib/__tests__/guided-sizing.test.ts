/**
 * The share count and the dollar figures on a guided card. These are the
 * numbers a user reads *instead of* the levels, so an error here is invisible
 * to them by design.
 */

import { describe, expect, it } from "vitest";
import { sizeGuidedTrade } from "@/lib/guided/sizing";
import { MIN_GUIDED_QTY } from "@/lib/guided/config";
import { capitalPerShare, maxSharesForCapital } from "@/lib/risk/gannCapital";

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
  capitalHeldUsd: 0,
};

describe("sizeGuidedTrade", () => {
  it("sizes from the risk cap and the entry-to-stop distance, not from equity alone", () => {
    // 1% of 100k = $1,000 of risk, $10 a share → 100 shares.
    const sized = sizeGuidedTrade(base);
    expect(sized.qty).toBe(100);
    expect(sized.riskUsd).toBeCloseTo(1000, 6);
    expect(sized.boundBy).toBe("risk");
  });

  it("values the whole position at the MTP, since nothing sells at a fixed target (Q14)", () => {
    // No 60% at TP1 any more: all 100 shares run, so reaching 125 is 100 × 25.
    expect(sizeGuidedTrade(base).rewardUsd).toBeCloseTo(100 * 25, 6);
  });

  it("values the whole position at TP1 for the first level ahead", () => {
    expect(sizeGuidedTrade(base).rewardAtTp1Usd).toBeCloseTo(100 * 15, 6);
  });

  it("lets the capital rule bind when a tight stop implies a large position (A-RISK-01)", () => {
    // A 50-cent stop at 2% risk implies 800 shares of a $20,000 account; at $100
    // the rule holds about $49.77 a share, so the account carries 401.
    const sized = sizeGuidedTrade({ ...base, equity: 20_000, riskPct: 2, stopLoss: 99.5, takeProfit1: 103, masterProfit: 105 });
    expect(sized.qty).toBe(maxSharesForCapital(20_000, 100));
    expect(sized.boundBy).toBe("capital");
  });

  it("shrinks as capital already held behind open shares rises", () => {
    const held = 100_000 - 10 * capitalPerShare(100);
    const sized = sizeGuidedTrade({ ...base, stopLoss: 98, capitalHeldUsd: held });
    expect(sized.qty).toBe(10);
    expect(sized.boundBy).toBe("capital");
  });

  it("is bounded by cash when the account cannot pay for the risk-sized position", () => {
    const sized = sizeGuidedTrade({ ...base, buyingPower: 2_500 });
    expect(sized.qty).toBe(25);
    expect(sized.boundBy).toBe("buying_power");
  });

  it("places a single share, now that nothing has to be split (Q14)", () => {
    // $15 of risk budget against $10 a share: one share.
    expect(MIN_GUIDED_QTY).toBe(1);
    const sized = sizeGuidedTrade({ ...base, equity: 1_500, buyingPower: 1_500 });
    expect(sized.qty).toBe(1);
    expect(sized.blockedReason).toBeNull();
  });

  it("says the room is spent when the capital is already held", () => {
    const sized = sizeGuidedTrade({ ...base, capitalHeldUsd: 100_000 });
    expect(sized.qty).toBe(0);
    expect(sized.blockedReason).toContain("Close a position");
  });

  it("does not tell a user with nothing deployed to close a position", () => {
    const sized = sizeGuidedTrade({ ...base, equity: 300, buyingPower: 300 });
    expect(sized.qty).toBe(0);
    expect(sized.blockedReason).not.toContain("Close a position");
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
    // All 100 shares covered at 75.
    expect(sized.rewardUsd).toBeCloseTo(100 * 25, 6);
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

  it("is still bounded by the capital rule, which is a short's ceiling", () => {
    const sized = sizeGuidedTrade({ ...short, capitalHeldUsd: 100_000 - 10 * capitalPerShare(100) });
    expect(sized.qty).toBe(10);
    expect(sized.boundBy).toBe("capital");
  });

  it("never risks more than the cap on a wide short stop", () => {
    const sized = sizeGuidedTrade({ ...short, stopLoss: 160 });
    expect(sized.riskUsd).toBeLessThanOrEqual(short.equity * (short.riskPct / 100));
  });
});

// A-RISK-04 / Q7: the risk percent applies to Gann's trading unit, not to
// equity that a run of profits has raised (`gannRiskCapital`).
describe("sizeGuidedTrade on Gann's trading unit", () => {
  it("sizes the risk budget off riskCapital when it is given", () => {
    const sized = sizeGuidedTrade({ ...base, equity: 150_000, buyingPower: 150_000, riskCapital: 100_000 });
    expect(sized.riskUsd).toBeCloseTo(1000, 6);
  });
  it("is wired into both Guided paths", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("lib/guided/service.ts", "utf8")).toMatch(/riskCapital: account\.riskCapital/);
    expect(readFileSync("app/api/guided/execute/route.ts", "utf8")).toMatch(/riskCapital: account\.riskCapital/);
    expect(readFileSync("lib/guided/service.ts", "utf8")).toMatch(/gannRiskCapital\(/);
  });
});

describe("sizeGuidedTrade: never more than a tenth of the capital at risk (never-failing rule 1)", () => {
  it("caps a risk percent over 10% at a tenth of the trading capital", () => {
    // 25% of a $10,000 unit would risk $2,500; a tenth is $1,000, so $10 a share carries 100.
    const sized = sizeGuidedTrade({ ...base, riskPct: 25, riskCapital: 10_000 });
    expect(sized.qty).toBe(100);
    expect(sized.riskUsd).toBeLessThanOrEqual(1_000 + 1e-6);
    expect(sized.boundBy).toBe("risk");
  });
  it("leaves a risk percent under a tenth alone", () => {
    expect(sizeGuidedTrade({ ...base, riskPct: 2, riskCapital: 10_000 }).qty).toBe(20);
  });
});
