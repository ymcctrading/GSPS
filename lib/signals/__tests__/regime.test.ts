import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { classifyRegime } from "../regime";

function bar(o: number, h: number, l: number, c: number, v = 1000): Bar {
  return { t: "2026-01-01T00:00:00Z", o, h, l, c, v };
}

/** A zigzag uptrend: legs up for 8 bars then a 3-bar pullback, each leg higher than the last. */
function uptrendBars(n: number): Bar[] {
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const cyclePos = i % 11;
    const rising = cyclePos < 8;
    const o = price;
    const c = price + (rising ? 0.8 : -0.5);
    // Asymmetric wick padding avoids the exact high/low ties a symmetric
    // +/-0.2 buffer produces at every leg turn (open(i) === close(i-1)),
    // which would otherwise mask real swing points from findPivots.
    const h = rising ? c + 0.5 : o + 0.1;
    const l = rising ? o - 0.1 : c - 0.5;
    bars.push(bar(o, h, l, c, 1000 + (i % 5) * 50));
    price = c;
  }
  return bars;
}

/** A flat, oscillating range between two bounds. */
function rangeBars(n: number): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const cyclePos = i % 10;
    const base = 100 + (cyclePos < 5 ? cyclePos : 10 - cyclePos) * 0.4;
    bars.push(bar(base, base + 0.4, base - 0.4, base + (i % 2 === 0 ? 0.1 : -0.1), 900));
  }
  return bars;
}

describe("classifyRegime", () => {
  it("flags event/high-uncertainty regardless of price action when a hard flag is set", () => {
    const read = classifyRegime({ bars: uptrendBars(80), scheduledBinaryEvent: true });
    expect(read.regime).toBe("event");
    expect(read.direction).toBe("sideways");
  });

  it("reads a clean, sustained uptrend as a bullish trend", () => {
    const read = classifyRegime({ bars: uptrendBars(120) });
    expect(read.regime).toBe("trend");
    expect(read.direction).toBe("bullish");
    expect(read.disqualifiers).toHaveLength(0);
  });

  it("disqualifies a trend read when the trend overlay keeps flipping", () => {
    const read = classifyRegime({ bars: uptrendBars(120), trendOverlayFlips: 5 });
    expect(read.disqualifiers.some((d) => d.includes("overlay"))).toBe(true);
  });

  it("reads insufficient history as event/high-uncertainty rather than guessing", () => {
    const read = classifyRegime({ bars: uptrendBars(10) });
    expect(read.regime).toBe("event");
  });

  it("reads a flat oscillating range as the range regime", () => {
    const read = classifyRegime({ bars: rangeBars(120) });
    expect(read.regime).toBe("range");
    expect(read.direction).toBe("sideways");
  });
});
