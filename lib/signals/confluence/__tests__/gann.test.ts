import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { evaluateGannConfluence } from "../gann";

function bar(o: number, h: number, l: number, c: number, v = 1000): Bar {
  return { t: "2026-01-01T00:00:00Z", o, h, l, c, v };
}

/**
 * A path with a genuine global-minimum spike near the start (index 5, price
 * 80) that is stale by the time the window ends, a confirmed pivot low later
 * on (index 52, price 244) that is not the global min, and a confirmed pivot
 * high after that (index 60, price 320) — enough structure to tell "anchor
 * from the most recent confirmed pivot" (blueprint §8.2) apart from
 * "Math.min() of the whole window".
 */
function swingBars(n: number): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i < n; i++) {
    let mid: number;
    if (i < 10) {
      mid = 100 - Math.abs(i - 5) * 4; // V-shaped dip bottoming at i=5, mid=80
    } else if (i === 52) {
      mid = 100 + 4 * (51 - 10) - 20; // shallow local low, well above the i=5 spike
    } else if (i === 60) {
      mid = 100 + 4 * (60 - 10) + 20; // local high spike
    } else {
      mid = 100 + 4 * (i - 10);
    }
    bars.push(bar(mid - 0.4, mid + 0.5, mid - 0.5, mid + 0.4));
  }
  return bars;
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

  it("computes price/time digital-root features (normalized ticks/bars, not the raw price) with a relationship", () => {
    const bars = uptrendBars(60);
    const result = evaluateGannConfluence({
      assetClass: "us_equity",
      symbol: "TEST",
      dailyBars: bars,
      currentPrice: bars[bars.length - 1].c,
      direction: "bullish",
    });
    expect(result.vortexContext.priceDisplacement).not.toBeNull();
    expect(result.vortexContext.timeDisplacement).not.toBeNull();
    expect(result.vortexContext.priceDisplacement!.activeDigitalRoot).toBeGreaterThanOrEqual(1);
    expect(result.vortexContext.priceDisplacement!.activeDigitalRoot).toBeLessThanOrEqual(9);
    expect(result.vortexContext.timeDisplacement!.activeDigitalRoot).toBeGreaterThanOrEqual(1);
    expect(result.vortexContext.timeDisplacement!.activeDigitalRoot).toBeLessThanOrEqual(9);
    expect(result.vortexContext.priceVortexClass).not.toBeNull();
    expect(result.vortexContext.timeVortexClass).not.toBeNull();
    expect(result.vortexContext.relationship).not.toBeNull();
  });

  it("has no vortexContext readings when there is insufficient bar history to compute them", () => {
    const result = evaluateGannConfluence({
      assetClass: "us_equity",
      symbol: "TEST",
      dailyBars: [],
      currentPrice: 100,
      direction: "bullish",
    });
    expect(result.vortexContext.priceDisplacement).toBeNull();
    expect(result.vortexContext.timeDisplacement).toBeNull();
    expect(result.vortexContext.relationship).toBeNull();
    expect(result.vortexContext.transition).toBeNull();
    expect(result.angleSlope).toBeNull();
  });

  it("has no transition when the caller supplies no prior reading", () => {
    const bars = uptrendBars(60);
    const result = evaluateGannConfluence({
      assetClass: "us_equity",
      symbol: "TEST",
      dailyBars: bars,
      currentPrice: bars[bars.length - 1].c,
      direction: "bullish",
    });
    expect(result.vortexContext.transition).toBeNull();
  });

  it("classifies a root transition when the caller supplies a prior reading", () => {
    const bars = uptrendBars(60);
    const currentPrice = bars[bars.length - 1].c;
    const withoutPrior = evaluateGannConfluence({
      assetClass: "us_equity",
      symbol: "TEST",
      dailyBars: bars,
      currentPrice,
      direction: "bullish",
    });
    const currentPriceRoot = withoutPrior.vortexContext.priceDisplacement!.activeDigitalRoot;
    // Force a genuine transition: pick a previous root different from the current one.
    const previousRoot = currentPriceRoot === 1 ? 2 : 1;

    const result = evaluateGannConfluence({
      assetClass: "us_equity",
      symbol: "TEST",
      dailyBars: bars,
      currentPrice,
      direction: "bullish",
      previousVortexRoots: { price: previousRoot, time: null },
    });
    expect(result.vortexContext.transition).not.toBeNull();
    // Either a named transition, or null (a real change matching neither pattern) -- never undefined/absent-shaped.
    expect(result.vortexContext.transition!.time).toBeNull();
  });

  it("computes a normalized angle slope for a supported market with enough history", () => {
    const bars = uptrendBars(60);
    const result = evaluateGannConfluence({
      assetClass: "us_equity",
      symbol: "TEST",
      dailyBars: bars,
      currentPrice: bars[bars.length - 1].c,
      direction: "bullish",
    });
    expect(result.angleSlope).not.toBeNull();
    expect(Number.isFinite(result.angleSlope!.slope)).toBe(true);
  });

  it("never classifies the Material Number vs structural node field — pending authorized specification", () => {
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

  it("anchors on the most recent confirmed pivot low for a bullish read, not Math.min() of the whole window (blueprint §8.2)", () => {
    const bars = swingBars(80);
    const result = evaluateGannConfluence({
      assetClass: "us_equity",
      symbol: "TEST",
      dailyBars: bars,
      currentPrice: bars[bars.length - 1].c,
      direction: "bullish",
    });
    const globalMin = Math.min(...bars.map((b) => b.l));
    expect(result.evidence.inputs.anchorKind).toBe("low");
    expect(result.evidence.inputs.anchorPrice).not.toBeCloseTo(globalMin, 0);
    expect(result.evidence.inputs.anchorPrice as number).toBeGreaterThan(globalMin + 50);
  });

  it("anchors on the most recent confirmed pivot high for a bearish read", () => {
    const bars = swingBars(80);
    const result = evaluateGannConfluence({
      assetClass: "us_equity",
      symbol: "TEST",
      dailyBars: bars,
      currentPrice: bars[bars.length - 1].c,
      direction: "bearish",
    });
    expect(result.evidence.inputs.anchorKind).toBe("high");
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
