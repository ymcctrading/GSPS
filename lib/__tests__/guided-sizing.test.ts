/**
 * The share count and the dollar figures on a guided card. These are the
 * numbers a user reads *instead of* the levels, so an error here is invisible
 * to them by design.
 */

import { describe, expect, it } from "vitest";
import { sizeGuidedTrade } from "@/lib/guided/sizing";
import { MIN_GUIDED_QTY } from "@/lib/guided/config";

/**
 * Entry 100, stop 90, first target 1.5R, master 2.5R — $10 of risk a share.
 *
 * `maxTradeNotionalPct` is set well above what any of these fixtures would
 * imply so the risk/portfolio/cash tests below keep isolating the ceiling
 * they're named for. The notional cap itself gets its own describe block.
 */
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
  maxTradeNotionalPct: 100,
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

/**
 * The per-trade notional cap — stocks only. A stop sitting very close to entry
 * (the common case for a structural entry right on a level) implies a huge
 * position under pure risk sizing; this ceiling is what keeps that position
 * looking like a trade a novice would actually place.
 */
describe("sizeGuidedTrade — per-trade notional cap", () => {
  // $0.50 of risk a share — a stop 0.5% below a $100 entry — makes the risk
  // cap alone imply 1% of 100k / $0.50 = 2,000 shares, or $200,000 of notional
  // on a $100,000 account. Nothing about that is one ordinary trade.
  const tightStop = { ...base, stopLoss: 99.5, takeProfit1: 100.75, masterProfit: 101.25 };

  it("binds a tight-stop stock trade to the notional cap rather than the risk cap", () => {
    const sized = sizeGuidedTrade({ ...tightStop, maxTradeNotionalPct: 8 });
    // 8% of $100,000 ÷ $100 entry = 80 shares, not the 2,000 the risk cap implies.
    expect(sized.qty).toBe(80);
    expect(sized.boundBy).toBe("notional");
    expect(sized.notionalUsd).toBeCloseTo(8_000, 6);
  });

  it("does not apply the notional cap to crypto", () => {
    const sized = sizeGuidedTrade({
      ...tightStop,
      maxTradeNotionalPct: 8,
      assetClass: "crypto",
      wholeUnitsOnly: false,
    });
    expect(sized.boundBy).not.toBe("notional");
    expect(sized.notionalUsd).toBeGreaterThan(8_000);
  });

  it("defaults to the shipped notional cap when a caller omits it", () => {
    const sized = sizeGuidedTrade({ ...tightStop, maxTradeNotionalPct: undefined });
    expect(sized.boundBy).toBe("notional");
    expect(sized.notionalUsd).toBeLessThanOrEqual(base.equity * 0.08 + 1e-6);
  });

  it("leaves an ordinary, wider-stop trade bound by risk as before", () => {
    // The original base fixture: $10 of risk a share, 1% risk cap → 100
    // shares, $10,000 notional — 10% of equity, comfortably inside a
    // generous 15% notional cap.
    const sized = sizeGuidedTrade({ ...base, maxTradeNotionalPct: 15 });
    expect(sized.qty).toBe(100);
    expect(sized.boundBy).toBe("risk");
  });
});
