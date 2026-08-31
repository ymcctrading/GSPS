/**
 * The Novice Market Universe engine's boolean formulas — every filter has to
 * fail the plan it should fail and pass the plan it should pass, since this
 * is the gate standing between "the scanner found something" and a novice
 * ever seeing the symbol at all.
 */

import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { assessNoviceEligibility, assessTradeQualification, DEFAULT_UNIVERSE_THRESHOLDS } from "@/lib/universe/eligibility";
import { marketCapPass, isCoreMarketCap } from "@/lib/universe/marketCap";
import { liquidityPass, isCoreLiquidity } from "@/lib/universe/liquidity";
import { priceOrFractionalPass } from "@/lib/universe/priceAccessibility";
import { spreadPass } from "@/lib/universe/spread";
import { eventRiskPass } from "@/lib/universe/eventRisk";
import { volatilityPass } from "@/lib/universe/volatility";
import { dataQualityPass, type DataQualityInputs } from "@/lib/universe/dataQuality";
import { checkProhibited } from "@/lib/universe/prohibited";

function dailyBars(count: number, opts: { close?: number; atrPct?: number } = {}): Bar[] {
  const close = opts.close ?? 50;
  const range = close * ((opts.atrPct ?? 2) / 100);
  const bars: Bar[] = [];
  let t = Date.now() - count * 86_400_000;
  for (let i = 0; i < count; i++) {
    bars.push({
      t: new Date(t).toISOString(),
      o: close,
      h: close + range / 2,
      l: close - range / 2,
      c: close,
      v: 1_000_000,
    });
    t += 86_400_000;
  }
  return bars;
}

function goodDataQuality(now = new Date()): DataQualityInputs {
  return {
    quote: { timestamp: now, exchangeSession: "NASDAQ regular", adjusted: true, latencyStatus: "live" },
    corporateActions: { adjustmentsApplied: true, identified: true },
    earningsEvent: { dateTimeZone: "2026-11-01T21:00:00Z", confidence: "confirmed", source: "vendor" },
    fundamentals: { asOfDate: now, sourceConsistent: true },
    now,
  };
}

describe("market_cap_pass", () => {
  it("blocks below the $10B absolute floor", () => {
    expect(marketCapPass(9_999_999_999).pass).toBe(false);
  });
  it("passes at the floor", () => {
    expect(marketCapPass(10_000_000_000).pass).toBe(true);
  });
  it("blocks unknown cap rather than assuming large", () => {
    expect(marketCapPass(null).pass).toBe(false);
  });
  it("flags core vs. non-core", () => {
    expect(isCoreMarketCap(15_000_000_000)).toBe(false);
    expect(isCoreMarketCap(20_000_000_000)).toBe(true);
  });
});

describe("liquidity_pass", () => {
  it("blocks below the $250M Novice floor even if it clears the platform floor", () => {
    expect(liquidityPass(10_000_000).pass).toBe(false);
  });
  it("passes at $250M", () => {
    expect(liquidityPass(250_000_000).pass).toBe(true);
  });
  it("flags core vs. non-core", () => {
    expect(isCoreLiquidity(300_000_000)).toBe(false);
    expect(isCoreLiquidity(500_000_000)).toBe(true);
  });
});

describe("price_or_fractional_pass", () => {
  it("passes inside the $10-$125 band", () => {
    expect(priceOrFractionalPass(50, null).pass).toBe(true);
  });
  it("blocks outside the band without confirmed fractional support", () => {
    expect(priceOrFractionalPass(300, null).pass).toBe(false);
    expect(priceOrFractionalPass(300, false).pass).toBe(false);
  });
  it("passes outside the band with confirmed fractional support", () => {
    expect(priceOrFractionalPass(300, true).pass).toBe(true);
  });
});

describe("spread_pass", () => {
  it("falls back to the liquidity proxy when no bid/ask feed exists", () => {
    expect(spreadPass(null, true).pass).toBe(true);
    expect(spreadPass(null, false).pass).toBe(false);
  });
  it("blocks a spread wider than the price ceiling", () => {
    expect(spreadPass({ bid: 99, ask: 100, price: 100 }, true).pass).toBe(false);
  });
  it("blocks a spread that eats too much of the stop distance", () => {
    expect(spreadPass({ bid: 99.9, ask: 100, price: 100, stopDistance: 0.5 }, true).pass).toBe(false);
  });
  it("passes a tight spread", () => {
    expect(spreadPass({ bid: 99.98, ask: 100, price: 100, stopDistance: 2 }, true).pass).toBe(true);
  });
});

describe("event_risk_pass", () => {
  it("blocks a known binary event in the hold window", () => {
    expect(eventRiskPass(true).pass).toBe(false);
  });
  it("blocks unknown event data (defaults to caution/block)", () => {
    expect(eventRiskPass("unknown").pass).toBe(false);
  });
  it("passes a confirmed-clear window", () => {
    expect(eventRiskPass(false).pass).toBe(true);
  });
});

describe("volatility_pass", () => {
  it("blocks too little movement", () => {
    expect(volatilityPass(dailyBars(20, { atrPct: 0.1 })).pass).toBe(false);
  });
  it("blocks too much movement", () => {
    expect(volatilityPass(dailyBars(20, { atrPct: 15 })).pass).toBe(false);
  });
  it("passes a normal range", () => {
    expect(volatilityPass(dailyBars(20, { atrPct: 2 })).pass).toBe(true);
  });
});

describe("data_quality_pass", () => {
  it("passes a fully-verified read", () => {
    expect(dataQualityPass(goodDataQuality()).pass).toBe(true);
  });
  it("blocks stale quotes", () => {
    const q = goodDataQuality();
    q.quote = { ...q.quote!, latencyStatus: "stale" };
    expect(dataQualityPass(q).pass).toBe(false);
  });
  it("blocks unconfirmed/ambiguous earnings data", () => {
    const q = goodDataQuality();
    q.earningsEvent = { dateTimeZone: null, confidence: "unknown", source: null };
    expect(dataQualityPass(q).pass).toBe(false);
  });
  it("blocks stale fundamentals", () => {
    const q = goodDataQuality();
    q.fundamentals = { asOfDate: new Date(Date.now() - 200 * 86_400_000), sourceConsistent: true };
    expect(dataQualityPass(q).pass).toBe(false);
  });
});

describe("prohibited/conditional", () => {
  it("blocks a known leveraged/inverse ETF", () => {
    expect(checkProhibited("TQQQ").prohibited).toBe(true);
  });
  it("does not block an ordinary large-cap name", () => {
    expect(checkProhibited("AAPL").prohibited).toBe(false);
  });
});

describe("assessNoviceEligibility", () => {
  const now = new Date();
  const base = {
    symbol: "AAPL",
    marketCapUsd: 3_000_000_000_000,
    avgDailyDollarVolume: 1_000_000_000,
    price: 50,
    fractionalConfirmed: null,
    spreadQuote: null,
    binaryEventInHoldWindow: false as const,
    dailyBars: dailyBars(20, { close: 50, atrPct: 2 }),
    dataQuality: goodDataQuality(now),
  };

  it("passes when every filter clears", () => {
    const verdict = assessNoviceEligibility(base);
    expect(verdict.eligible).toBe(true);
    expect(verdict.reasons).toEqual([]);
  });

  it("fails when any one filter fails, and reports it", () => {
    const verdict = assessNoviceEligibility({ ...base, marketCapUsd: 1_000_000_000 });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reasons.some((r) => r.includes("$10B"))).toBe(true);
  });

  it("short-circuits on a prohibited symbol before running the other filters", () => {
    const verdict = assessNoviceEligibility({ ...base, symbol: "TQQQ", marketCapUsd: null });
    expect(verdict.eligible).toBe(false);
    expect(verdict.filters).toHaveLength(1);
    expect(verdict.filters[0].key).toBe("prohibited_class");
  });
});

describe("assessTradeQualification", () => {
  it("requires novice_eligible AND every downstream gate", () => {
    const eligible = assessNoviceEligibility({
      symbol: "AAPL",
      marketCapUsd: 3_000_000_000_000,
      avgDailyDollarVolume: 1_000_000_000,
      price: 50,
      fractionalConfirmed: null,
      spreadQuote: null,
      binaryEventInHoldWindow: false,
      dailyBars: dailyBars(20, { close: 50, atrPct: 2 }),
      dataQuality: goodDataQuality(),
    });

    expect(
      assessTradeQualification({
        noviceEligibility: eligible,
        regimePass: true,
        confirmationPass: true,
        targetPathPass: true,
        accountRiskPass: true,
      }).qualified,
    ).toBe(true);

    expect(
      assessTradeQualification({
        noviceEligibility: eligible,
        regimePass: true,
        confirmationPass: true,
        targetPathPass: true,
        accountRiskPass: false,
      }).qualified,
    ).toBe(false);
  });
});

describe("assessNoviceEligibility policy_values threshold overrides", () => {
  const baseInputs = {
    symbol: "AAPL",
    marketCapUsd: 15_000_000_000,
    avgDailyDollarVolume: 300_000_000,
    price: 50,
    fractionalConfirmed: null,
    spreadQuote: null,
    binaryEventInHoldWindow: false as const,
    dailyBars: dailyBars(20, { close: 50, atrPct: 2 }),
    dataQuality: goodDataQuality(),
  };

  it("passes with code defaults at these inputs", () => {
    expect(assessNoviceEligibility(baseInputs).eligible).toBe(true);
  });

  it("a tighter market-cap floor override blocks a symbol the code default would have passed", () => {
    const tighter = {
      ...DEFAULT_UNIVERSE_THRESHOLDS,
      marketCap: { ...DEFAULT_UNIVERSE_THRESHOLDS.marketCap, marketCapFloorUsd: 20_000_000_000 },
    };
    const verdict = assessNoviceEligibility(baseInputs, tighter);
    expect(verdict.eligible).toBe(false);
    expect(verdict.reasons.join(" ")).toMatch(/below the \$10B absolute floor/);
  });

  it("a looser liquidity floor override passes a symbol the code default would have blocked", () => {
    const looser = {
      ...DEFAULT_UNIVERSE_THRESHOLDS,
      liquidity: { ...DEFAULT_UNIVERSE_THRESHOLDS.liquidity, noviceLiquidityFloorUsd: 100_000_000 },
    };
    const thin = { ...baseInputs, avgDailyDollarVolume: 150_000_000 };
    expect(assessNoviceEligibility(thin).eligible).toBe(false);
    expect(assessNoviceEligibility(thin, looser).eligible).toBe(true);
  });
});
