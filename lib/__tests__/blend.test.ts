import { describe, it, expect } from "vitest";
import { buildBlendedPositions, type RawPosition } from "@/lib/portfolio/blend";

function equity(overrides: Partial<RawPosition> = {}): RawPosition {
  return {
    symbol: "AAPL",
    qty: 10,
    side: "long",
    avgEntry: 200,
    currentPrice: 220,
    marketValue: 2200,
    unrealizedPl: 200,
    unrealizedPlPct: 10,
    todayPlPct: 1.2,
    assetClassHint: "us_equity",
    ...overrides,
  };
}

function option(overrides: Partial<RawPosition> = {}): RawPosition {
  return {
    symbol: "AAPL250117C00220000",
    qty: 2,
    side: "long",
    avgEntry: 5,
    currentPrice: 6,
    marketValue: 1200,
    unrealizedPl: 200,
    unrealizedPlPct: 20,
    todayPlPct: 3,
    assetClassHint: "us_option",
    ...overrides,
  };
}

describe("buildBlendedPositions", () => {
  it("groups a shares leg and an option leg under one parent ticker", () => {
    const groups = buildBlendedPositions([equity(), option()], () => 220);
    expect(groups).toHaveLength(1);
    const g = groups[0];
    expect(g.underlying).toBe("AAPL");
    expect(g.equity).not.toBeNull();
    expect(g.equity?.totalShares).toBe(10);
    expect(g.equity?.avgFillPrice).toBe(200);
    expect(g.options).toHaveLength(1);
    expect(g.options[0].strike).toBe(220);
    expect(g.options[0].type).toBe("call");
    expect(g.options[0].expiration).toBe("2025-01-17");
  });

  it("aggregates market value and P/L across every leg", () => {
    const [g] = buildBlendedPositions([equity(), option()], () => 220);
    expect(g.totalMarketValue).toBe(2200 + 1200);
    expect(g.totalPl).toBe(200 + 200);
  });

  it("keeps an option-only underlying separate from an unrelated equity holding", () => {
    const groups = buildBlendedPositions(
      [equity({ symbol: "MSFT" }), option()], // AAPL option, MSFT shares
      () => 220,
    );
    expect(groups.map((g) => g.underlying).sort()).toEqual(["AAPL", "MSFT"]);
    const aapl = groups.find((g) => g.underlying === "AAPL")!;
    expect(aapl.equity).toBeNull();
    expect(aapl.options).toHaveLength(1);
  });

  it("supports multiple option legs (different strikes/expirations) on one underlying", () => {
    const groups = buildBlendedPositions(
      [option(), option({ symbol: "AAPL250117P00200000", side: "long" })],
      () => 220,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].options).toHaveLength(2);
    // Sorted by expiration then strike.
    expect(groups[0].options.map((o) => o.type)).toEqual(["put", "call"]);
  });

  it("omits greeks (zeroed) when no spot price is available for the underlying", () => {
    const [g] = buildBlendedPositions([option()], () => null);
    expect(g.options[0].greeks).toEqual({ delta: 0, gamma: 0, theta: 0, vega: 0 });
    expect(g.options[0].impliedVol).toBe(0);
  });

  it("computes plausible greeks when a spot price is available", () => {
    const [g] = buildBlendedPositions([option()], () => 220); // slightly ITM call
    const leg = g.options[0];
    expect(leg.greeks.delta).toBeGreaterThan(0);
    expect(leg.greeks.delta).toBeLessThanOrEqual(1);
    expect(leg.impliedVol).toBeGreaterThan(0);
  });

  it("classifies via symbol shape when the broker sends no asset_class hint", () => {
    const groups = buildBlendedPositions(
      [equity({ assetClassHint: undefined }), option({ assetClassHint: undefined })],
      () => 220,
    );
    expect(groups[0].equity).not.toBeNull();
    expect(groups[0].options).toHaveLength(1);
  });

  it("skips a position the broker flags as an option but whose symbol doesn't parse", () => {
    const groups = buildBlendedPositions(
      [option({ symbol: "BROKEN", assetClassHint: "us_option" })],
      () => 220,
    );
    expect(groups).toHaveLength(0);
  });
});
