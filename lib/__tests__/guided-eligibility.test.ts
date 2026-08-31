/**
 * The gates between "the scanner found something" and "a novice is shown a Buy
 * button with the score hidden". Each of these is a case where the wrong answer
 * puts a real order behind a one-tap confirmation.
 */

import { describe, expect, it } from "vitest";
import type { ScanResult, TradeLevels } from "@/lib/types";
import { assessEligibility, sizeIsTradeable, stillMatches } from "@/lib/guided/eligibility";
import { MIN_EQUITY_AVG_VOLUME, MIN_EQUITY_PRICE_USD } from "@/lib/scan/liquidity";

const levels: TradeLevels = {
  entry: 100,
  stopLoss: 98,
  takeProfit1: 103,
  takeProfit2: 105,
  masterProfit: 105,
  riskPerShare: 2,
  rewardToRiskTp1: 1.5,
  rewardToRiskTp2: 2.5,
  rewardToRiskMaster: 2.5,
  masterFromStructure: true,
  stopPctOfPrice: 2,
  stopBandWarning: null,
};

function scan(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    symbol: "AAPL",
    assetClass: "us_equity",
    scannedAt: new Date().toISOString(),
    currentPrice: 100,
    direction: "bullish",
    setupKind: "reversion",
    momentumElevated: true,
    trends: [],
    gann: { fanLines: [], squareOf9: [], timeCycleActive: false, timeCycleDates: [] },
    pattern: {
      name: "2-1-2",
      direction: "bullish",
      triggerPrice: 100,
      stopPrice: 98,
      description: "",
    },
    armedPatterns: [],
    levels,
    decision: { score: 8, outputState: "Execute", breakdown: [] },
    liquidity: { price: 100, avgVolume: 5_000_000, avgDollarVolume: 500_000_000 },
    noviceUniverse: { eligible: true, filters: [], reasons: [] },
    ...overrides,
  };
}

describe("assessEligibility", () => {
  it("passes a liquid, long, Execute-verdict setup with a priced plan", () => {
    expect(assessEligibility(scan())).toEqual({ eligible: true, reasons: [] });
  });

  it("refuses a Watch-tier setup", () => {
    const verdict = assessEligibility(
      scan({ decision: { score: 7, outputState: "Watch", breakdown: [] } }),
    );
    expect(verdict.eligible).toBe(false);
    expect(verdict.reasons[0]).toContain("Watch");
  });

  it("accepts a borrowable short", () => {
    const verdict = assessEligibility(scan({ direction: "bearish" }), true);
    expect(verdict).toEqual({ eligible: true, reasons: [] });
  });

  it("refuses a short the broker will not lend", () => {
    const verdict = assessEligibility(scan({ direction: "bearish" }), false);
    expect(verdict.eligible).toBe(false);
    expect(verdict.reasons.some((r) => r.includes("borrowed"))).toBe(true);
  });

  it("refuses a short whose borrow was never confirmed, rather than assuming it", () => {
    const verdict = assessEligibility(scan({ direction: "bearish" }));
    expect(verdict.eligible).toBe(false);
    expect(verdict.reasons.some((r) => r.includes("couldn't be confirmed"))).toBe(true);
  });

  it("never asks for a borrow on a long", () => {
    // `shortable: false` must not fail a long — it is not a question about it.
    expect(assessEligibility(scan(), false).eligible).toBe(true);
  });

  it("refuses a setup with no priced trade plan", () => {
    const verdict = assessEligibility(scan({ levels: null }));
    expect(verdict.eligible).toBe(false);
    expect(verdict.reasons.some((r) => r.includes("No trade plan"))).toBe(true);
  });

  it("refuses a sub-floor penny stock", () => {
    const verdict = assessEligibility(
      scan({
        currentPrice: 0.8,
        liquidity: { price: 0.8, avgVolume: 9_000_000, avgDollarVolume: 7_200_000 },
      }),
    );
    expect(verdict.eligible).toBe(false);
    expect(verdict.reasons.some((r) => r.includes(`$${MIN_EQUITY_PRICE_USD} floor`))).toBe(true);
  });

  it("refuses a thinly traded symbol above the price floor", () => {
    const verdict = assessEligibility(
      scan({ liquidity: { price: 100, avgVolume: MIN_EQUITY_AVG_VOLUME - 1, avgDollarVolume: 1e7 } }),
    );
    expect(verdict.eligible).toBe(false);
    expect(verdict.reasons.some((r) => r.includes("a day"))).toBe(true);
  });

  it("refuses a symbol whose liquidity could not be read at all", () => {
    expect(assessEligibility(scan({ liquidity: undefined })).eligible).toBe(false);
  });

  it("refuses a plan computed on data a full execution bar behind", () => {
    const verdict = assessEligibility(
      scan({
        dataLag: { holdsExecute: true, note: "Bars are 15 minutes old." } as ScanResult["dataLag"],
      }),
    );
    expect(verdict.eligible).toBe(false);
  });

  it("refuses a symbol the Market Universe engine does not certify Novice-eligible", () => {
    const verdict = assessEligibility(
      scan({
        noviceUniverse: {
          eligible: false,
          filters: [{ key: "market_cap_pass", pass: false, reason: "Market cap is below the $10B floor." }],
          reasons: ["Market cap is below the $10B floor."],
        },
      }),
    );
    expect(verdict.eligible).toBe(false);
    expect(verdict.reasons.some((r) => r.includes("Not Novice-eligible") && r.includes("$10B floor"))).toBe(true);
  });

  it("refuses a scan built without a noviceUniverse read rather than assuming it passes", () => {
    const verdict = assessEligibility(scan({ noviceUniverse: undefined }));
    expect(verdict.eligible).toBe(false);
    expect(verdict.reasons.some((r) => r.includes("Novice-eligibility read"))).toBe(true);
  });
});

describe("stillMatches", () => {
  const agreed = {
    entry: 100,
    stopLoss: 98,
    takeProfit1: 103,
    masterProfit: 105,
    direction: "bullish" as const,
  };

  it("accepts an unchanged plan", () => {
    expect(stillMatches(scan(), agreed)).toEqual({ ok: true, reason: null });
  });

  it("accepts sub-cent drift, which is the rounding the levels are stored at", () => {
    const nudged = { ...levels, entry: 100.005 };
    expect(stillMatches(scan({ levels: nudged }), agreed).ok).toBe(true);
  });

  it("refuses a re-priced plan", () => {
    const moved = { ...levels, stopLoss: 97.5 };
    const result = stillMatches(scan({ levels: moved }), agreed);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("re-priced");
  });

  it("refuses a setup that dropped out of Execute between render and tap", () => {
    const result = stillMatches(
      scan({ decision: { score: 6, outputState: "Watch", breakdown: [] } }),
      agreed,
    );
    expect(result.ok).toBe(false);
  });

  it("refuses a setup that flipped direction between render and tap", () => {
    // The prices are unchanged; only the side is not. Submitting this would
    // sell a position the user confirmed buying.
    const flipped = scan({ direction: "bearish" });
    const result = stillMatches(flipped, agreed, true);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("flipped direction");
  });

  it("re-checks the borrow on a short at submission, not only at render", () => {
    const shortAgreed = { ...agreed, direction: "bearish" as const };
    const shortScan = scan({ direction: "bearish" });
    expect(stillMatches(shortScan, shortAgreed, true).ok).toBe(true);
    // Borrow withdrawn between the card and the tap.
    expect(stillMatches(shortScan, shortAgreed, false).ok).toBe(false);
  });
});

describe("sizeIsTradeable", () => {
  it("rejects a single share, which cannot follow the staged exit", () => {
    expect(sizeIsTradeable(1)).toBe(false);
    expect(sizeIsTradeable(2)).toBe(true);
  });
});
