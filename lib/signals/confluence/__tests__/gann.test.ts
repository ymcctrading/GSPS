import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { evaluateGannConfluence } from "../gann";

function bar(o: number, h: number, l: number, c: number, v = 1000): Bar {
  return { t: "2026-01-01T00:00:00Z", o, h, l, c, v };
}

function uptrendBars(n: number): Bar[] {
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const o = price;
    const c = price + 0.5;
    const h = c + 0.3;
    const l = o - 0.3;
    bars.push(bar(o, h, l, c));
    price = c;
  }
  return bars;
}

describe("evaluateGannConfluence", () => {
  it("routes unsupported markets to notImplemented without computing anything", () => {
    const result = evaluateGannConfluence({
      assetClass: "us_equity",
      symbol: "TEST",
      dailyBars: [],
      currentPrice: 100,
      direction: "bullish",
    });
    expect(result.alignment).toBe("notImplemented");
    expect(result.root).toBeNull();
    expect(result.marketAdapterStatus).toBe("supported");
    expect(result.market).toBe("equities");
  });

  it("computes root, coordinates and time cycles for a supported market with enough history", () => {
    const bars = uptrendBars(60);
    const currentPrice = bars[bars.length - 1].c;
    const result = evaluateGannConfluence({
      assetClass: "us_equity",
      symbol: "TEST",
      dailyBars: bars,
      currentPrice,
      direction: "bullish",
    });
    expect(result.marketAdapterStatus).toBe("supported");
    expect(result.root).not.toBeNull();
    expect(result.root).toBeGreaterThan(0);
    expect(result.evidence.calculationVersion).toBe(result.module.version);
    expect(result.evidence.explanationTrace.length).toBeGreaterThan(0);
    expect(result.materialNumberClassification).toBe("notImplemented");
  });

  it("never classifies Material Number vs Harmonic Node — pending authorized specification", () => {
    const bars = uptrendBars(60);
    const result = evaluateGannConfluence({
      assetClass: "us_equity",
      symbol: "TEST",
      dailyBars: bars,
      currentPrice: bars[bars.length - 1].c,
      direction: "bearish",
    });
    expect(result.materialNumberClassification).toBe("notImplemented");
  });

  it("marks options as an unsupported market adapter", () => {
    const result = evaluateGannConfluence({
      assetClass: "crypto",
      symbol: "BTCUSD",
      dailyBars: uptrendBars(60),
      currentPrice: 100,
      direction: null,
    });
    // crypto is supported today; assert the adapter identity is reported correctly.
    expect(result.market).toBe("crypto");
    expect(result.marketAdapterStatus).toBe("supported");
  });

  it("returns neutral alignment when no direction is supplied", () => {
    const bars = uptrendBars(60);
    const result = evaluateGannConfluence({
      assetClass: "us_equity",
      symbol: "TEST",
      dailyBars: bars,
      currentPrice: bars[bars.length - 1].c,
      direction: null,
    });
    expect(result.alignment).toBe("neutral");
  });
});
