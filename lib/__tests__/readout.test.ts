import { describe, it, expect } from "vitest";
import {
  buildReadout,
  indexAtTime,
  formatVolume,
  formatPrice,
  priceDigits,
  REL_VOLUME_LOOKBACK,
  type ReadoutBar,
} from "@/lib/chart/readout";

function bar(partial: Partial<ReadoutBar> & { time: number }): ReadoutBar {
  return { open: 10, high: 11, low: 9, close: 10.5, volume: 1000, ...partial };
}

function series(count: number, volume = 1000): ReadoutBar[] {
  return Array.from({ length: count }, (_, i) => bar({ time: 1_700_000_000 + i * 86_400, volume }));
}

describe("buildReadout", () => {
  it("derives range, body share and change from the bar", () => {
    const bars = [bar({ time: 1, open: 9.02, high: 9.07, low: 7.54, close: 7.76 })];
    const r = buildReadout(bars, 0)!;
    expect(r.range).toBeCloseTo(1.53);
    expect(r.change).toBeCloseTo(-1.26);
    expect(r.changePct).toBeCloseTo((-1.26 / 9.02) * 100);
    expect(r.bodyShare).toBeCloseTo(1.26 / 1.53);
    expect(r.direction).toBe("down");
  });

  it("marks a close at the high and at the low", () => {
    const high = buildReadout([bar({ time: 1, low: 9, high: 11, close: 11 })], 0)!;
    const low = buildReadout([bar({ time: 1, low: 9, high: 11, close: 9 })], 0)!;
    expect(high.closePosition).toBeCloseTo(1);
    expect(low.closePosition).toBeCloseTo(0);
  });

  it("survives a zero-range bar instead of dividing by it", () => {
    const r = buildReadout([bar({ time: 1, open: 5, high: 5, low: 5, close: 5 })], 0)!;
    expect(r.range).toBe(0);
    expect(r.bodyShare).toBe(0);
    expect(r.changePct).toBe(0);
    expect(r.closePosition).toBe(0.5);
    expect(r.direction).toBe("flat");
  });

  it("averages volume over prior bars only, so a spike does not dilute itself", () => {
    const bars = series(REL_VOLUME_LOOKBACK).concat(
      bar({ time: 1_700_000_000 + REL_VOLUME_LOOKBACK * 86_400, volume: 5000 }),
    );
    const r = buildReadout(bars, bars.length - 1)!;
    expect(r.relVolume).toBeCloseTo(5); // 5000 against a 1000 baseline
  });

  it("reports no relative volume for the first bar", () => {
    expect(buildReadout(series(3), 0)!.relVolume).toBeNull();
  });

  it("returns null outside the series", () => {
    expect(buildReadout(series(3), 7)).toBeNull();
    expect(buildReadout([], -1)).toBeNull();
  });
});

describe("indexAtTime", () => {
  const bars = series(50);

  it("finds an exact bar", () => {
    expect(indexAtTime(bars, bars[17].time)).toBe(17);
    expect(indexAtTime(bars, bars[0].time)).toBe(0);
    expect(indexAtTime(bars, bars[49].time)).toBe(49);
  });

  it("returns -1 for a time between or beyond bars", () => {
    expect(indexAtTime(bars, bars[10].time + 1)).toBe(-1);
    expect(indexAtTime(bars, 0)).toBe(-1);
    expect(indexAtTime([], 1)).toBe(-1);
  });
});

describe("formatting", () => {
  it("scales price precision to magnitude", () => {
    expect(priceDigits(412.5)).toBe(2);
    expect(priceDigits(7.77)).toBe(3);
    expect(priceDigits(0.0421)).toBe(5);
    expect(formatPrice(7.77, priceDigits(7.77))).toBe("7.770");
  });

  it("abbreviates volume", () => {
    expect(formatVolume(215_800_000)).toBe("215.8M");
    expect(formatVolume(1_240_000_000)).toBe("1.24B");
    expect(formatVolume(19_530)).toBe("19.5K");
    expect(formatVolume(842)).toBe("842");
  });
});
