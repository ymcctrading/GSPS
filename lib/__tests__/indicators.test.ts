import { describe, it, expect } from "vitest";
import { sma, ema, bollinger, rsi, volumeBars, type Candle } from "@/lib/indicators";

function mk(closes: number[]): Candle[] {
  return closes.map((c, i) => ({
    time: 1_700_000_000 + i * 86_400,
    open: c,
    high: c + 1,
    low: c - 1,
    close: c,
    volume: 100 + i,
  }));
}

describe("sma", () => {
  it("averages the trailing window and warms up correctly", () => {
    const out = sma(mk([1, 2, 3, 4, 5]), 3);
    expect(out).toHaveLength(3);
    expect(out[0].value).toBeCloseTo(2); // (1+2+3)/3
    expect(out[2].value).toBeCloseTo(4); // (3+4+5)/3
  });

  it("returns empty when there is not enough data", () => {
    expect(sma(mk([1, 2]), 3)).toEqual([]);
  });
});

describe("ema", () => {
  it("seeds on the SMA then decays toward recent closes", () => {
    const out = ema(mk([1, 2, 3, 4, 5]), 3);
    expect(out).toHaveLength(3);
    expect(out[0].value).toBeCloseTo(2); // SMA seed of first 3
    // k = 2/4 = 0.5 → next = 4*0.5 + 2*0.5 = 3
    expect(out[1].value).toBeCloseTo(3);
    expect(out[2].value).toBeCloseTo(4);
  });
});

describe("bollinger", () => {
  it("centers on the SMA with symmetric bands", () => {
    const bb = bollinger(mk([2, 4, 6, 8, 10]), 3, 2);
    expect(bb.middle).toHaveLength(3);
    const i = bb.middle.length - 1;
    expect(bb.middle[i].value).toBeCloseTo(8); // (6+8+10)/3
    const spread = bb.upper[i].value - bb.middle[i].value;
    expect(bb.middle[i].value - bb.lower[i].value).toBeCloseTo(spread);
    expect(spread).toBeGreaterThan(0);
  });
});

describe("rsi", () => {
  it("reads 100 when every bar closes up", () => {
    const out = rsi(mk([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]), 14);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].value).toBeCloseTo(100);
  });

  it("stays within 0–100", () => {
    const out = rsi(mk([5, 4, 6, 3, 7, 2, 8, 1, 9, 4, 6, 5, 7, 3, 8, 2, 9]), 14);
    for (const p of out) {
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.value).toBeLessThanOrEqual(100);
    }
  });
});

describe("volumeBars", () => {
  it("colors up and down bars differently", () => {
    const bars = volumeBars([
      { time: 1, open: 10, high: 11, low: 9, close: 11, volume: 100 },
      { time: 2, open: 11, high: 11, low: 8, close: 9, volume: 200 },
    ]);
    expect(bars).toHaveLength(2);
    expect(bars[0].color).not.toEqual(bars[1].color);
    expect(bars[0].value).toBe(100);
  });
});
