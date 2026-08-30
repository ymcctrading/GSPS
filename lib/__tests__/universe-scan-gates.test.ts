/**
 * The live-scan adapter (`lib/universe/scanGates.ts`) — every field it
 * builds has to be a real, already-computed value or an honestly documented
 * proxy, never a fabrication that makes `novice_eligible` look better than
 * the data actually supports.
 */

import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { buildScanNoviceEligibility } from "@/lib/universe/scanGates";
import { nextKnownEarningsEvent } from "@/lib/macro/earnings";

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

describe("nextKnownEarningsEvent", () => {
  it("finds a future date for a covered mega-cap symbol", () => {
    const event = nextKnownEarningsEvent("MCD", new Date("2026-09-01T00:00:00Z"));
    expect(event).not.toBeNull();
    expect(event!.symbol).toBe("MCD");
    expect(event!.date >= "2026-09-01").toBe(true);
  });

  it("returns null for a symbol outside the mega-cap calendar", () => {
    expect(nextKnownEarningsEvent("NOTAREALTICKER", new Date("2026-09-01T00:00:00Z"))).toBeNull();
  });
});

describe("buildScanNoviceEligibility", () => {
  const scannedAt = "2026-09-01T14:30:00Z";

  it("passes a name covered by both the large-cap list and the earnings calendar, with healthy liquidity/price/volatility", () => {
    const verdict = buildScanNoviceEligibility({
      symbol: "MCD",
      assetClass: "us_equity",
      currentPrice: 50,
      liquidity: { price: 50, avgVolume: 20_000_000, avgDollarVolume: 1_000_000_000 },
      dailyBars: dailyBars(20, { close: 50, atrPct: 2 }),
      binaryEventInHoldPeriod: false,
      dataLagged: false,
      scannedAt,
    });
    expect(verdict.eligible).toBe(true);
    expect(verdict.reasons).toEqual([]);
  });

  it("fails closed on a symbol outside both the large-cap list and the earnings calendar", () => {
    const verdict = buildScanNoviceEligibility({
      symbol: "ZZZZ",
      assetClass: "us_equity",
      currentPrice: 50,
      liquidity: { price: 50, avgVolume: 20_000_000, avgDollarVolume: 1_000_000_000 },
      dailyBars: dailyBars(20, { close: 50, atrPct: 2 }),
      binaryEventInHoldPeriod: null,
      dataLagged: false,
      scannedAt,
    });
    expect(verdict.eligible).toBe(false);
    // Both market_cap_pass (no large-cap coverage) and data_quality_pass (no
    // earnings coverage) should fail closed independently.
    expect(verdict.filters.find((f) => f.key === "market_cap_pass")?.pass).toBe(false);
    expect(verdict.filters.find((f) => f.key === "data_quality_pass")?.pass).toBe(false);
  });

  it("short-circuits on a prohibited leveraged/inverse symbol", () => {
    const verdict = buildScanNoviceEligibility({
      symbol: "TQQQ",
      assetClass: "us_equity",
      currentPrice: 50,
      liquidity: { price: 50, avgVolume: 20_000_000, avgDollarVolume: 1_000_000_000 },
      dailyBars: dailyBars(20, { close: 50, atrPct: 2 }),
      binaryEventInHoldPeriod: false,
      dataLagged: false,
      scannedAt,
    });
    expect(verdict.eligible).toBe(false);
    expect(verdict.filters).toHaveLength(1);
    expect(verdict.filters[0].key).toBe("prohibited_class");
  });

  it("fails on a known binary event in the hold window even for an otherwise-eligible mega-cap", () => {
    const verdict = buildScanNoviceEligibility({
      symbol: "MCD",
      assetClass: "us_equity",
      currentPrice: 50,
      liquidity: { price: 50, avgVolume: 20_000_000, avgDollarVolume: 1_000_000_000 },
      dailyBars: dailyBars(20, { close: 50, atrPct: 2 }),
      binaryEventInHoldPeriod: true,
      dataLagged: false,
      scannedAt,
    });
    expect(verdict.eligible).toBe(false);
    expect(verdict.filters.find((f) => f.key === "event_risk_pass")?.pass).toBe(false);
  });

  it("falls back to the liquidity proxy for spread_pass since no bid/ask feed exists at scan time", () => {
    const verdict = buildScanNoviceEligibility({
      symbol: "MCD",
      assetClass: "us_equity",
      currentPrice: 50,
      liquidity: { price: 50, avgVolume: 1_000, avgDollarVolume: 50_000 },
      dailyBars: dailyBars(20, { close: 50, atrPct: 2 }),
      binaryEventInHoldPeriod: false,
      dataLagged: false,
      scannedAt,
    });
    expect(verdict.filters.find((f) => f.key === "liquidity_pass")?.pass).toBe(false);
    expect(verdict.filters.find((f) => f.key === "spread_pass")?.pass).toBe(false);
  });
});
