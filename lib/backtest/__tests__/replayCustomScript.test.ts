import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { replayCustomScript } from "@/lib/backtest/replayCustomScript";

function bar(o: number, h: number, l: number, c: number, v = 1000): Bar {
  return { t: "2026-01-01T00:00:00Z", o, h, l, c, v } as Bar;
}

function oscillatingBars(n: number): Bar[] {
  const bars: Bar[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    p += i % 5 < 2 ? 2.2 : -1.6;
    bars.push(bar(p - 0.5, p + 1, p - 1, p));
  }
  return bars;
}

/** Several full down/up swings, so a growing-window walk-forward crosses the
 * EMA9/SMA20 pair more than once (unlike a single reversal, which only arms
 * near the very end of the series once the window is long enough). */
function multiSwingBars(): Bar[] {
  const bars: Bar[] = [];
  let p = 150;
  for (let swing = 0; swing < 3; swing++) {
    for (let i = 0; i < 25; i++) {
      p -= 1.2;
      bars.push(bar(p + 0.5, p + 1, p - 1, p));
    }
    for (let i = 0; i < 8; i++) {
      p += 4;
      bars.push(bar(p - 0.5, p + 1.5, p - 1.5, p));
    }
  }
  return bars;
}

const IDENTITY = { scriptId: "script-1", scriptName: "Replay test", author: "tester", version: 1 };

const SOURCE = `
  rule bullish when crossesAbove(ema(9), sma(20)) {
    entry = high[0] * 1.0005
    stop = lowest(low, 10)
    tp1r = 2
    mtpr = 4
  }
  rule bearish when crossesBelow(ema(9), sma(20)) {
    entry = low[0] * 0.9995
    stop = highest(high, 10)
    tp1r = 2
    mtpr = 4
  }
`;

describe("replayCustomScript", () => {
  it("returns ok:false with the parser's error for a script that fails to compile", () => {
    const result = replayCustomScript("AAPL", IDENTITY, "not a valid script", oscillatingBars(50));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });

  it("walks the full bar series and records an event only where the script actually armed", () => {
    const bars = multiSwingBars();
    const result = replayCustomScript("AAPL", IDENTITY, SOURCE, bars);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.barsEvaluated).toBe(bars.length);
    expect(result.armedCount).toBe(result.events.length);
    expect(result.bullishCount + result.bearishCount).toBe(result.armedCount);
    expect(result.armedCount).toBeGreaterThan(0);

    for (const event of result.events) {
      expect(event.riskPerShare).toBeGreaterThan(0);
      expect(event.index).toBeGreaterThanOrEqual(1);
      expect(event.index).toBeLessThan(bars.length);
      expect(event.date).toBe(bars[event.index].t);
    }
  });

  it("indices strictly increase in the order bars were walked", () => {
    const result = replayCustomScript("AAPL", IDENTITY, SOURCE, multiSwingBars());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (let i = 1; i < result.events.length; i++) {
      expect(result.events[i].index).toBeGreaterThan(result.events[i - 1].index);
    }
  });

  it("carries the script's own identity, never a generic label", () => {
    const result = replayCustomScript("AAPL", IDENTITY, SOURCE, multiSwingBars());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scriptId).toBe(IDENTITY.scriptId);
    expect(result.scriptName).toBe(IDENTITY.scriptName);
    expect(result.author).toBe(IDENTITY.author);
    expect(result.version).toBe(IDENTITY.version);
  });

  it("armedCount is 0 (not an error) for a script that never arms on flat data", () => {
    const flat = Array.from({ length: 40 }, () => bar(99.5, 100.5, 99, 100));
    const result = replayCustomScript("AAPL", IDENTITY, SOURCE, flat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.armedCount).toBe(0);
    expect(result.events).toEqual([]);
  });
});
