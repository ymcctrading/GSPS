import { describe, expect, it } from "vitest";
import type { Bar } from "@/lib/types";
import { atr } from "@/lib/analysis/pivots";
import { computeMidpointFan } from "@/lib/gann/midpointFan";
import { squareFromHigh } from "@/lib/gann/midpointFan";

const DAY = 86_400_000;
const daily = (closes: number[]): Bar[] =>
  closes.map((c, i) => ({ t: new Date(Date.UTC(2026, 0, 5) + i * DAY).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1e6 }));
const line = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);

describe("C-LEVELS-10: angles from the 50% mark", () => {
  // A low near 100, a high near 140 (50% = 120), then a fall back through 120.
  const closes = [...line(110, 100, 10), ...line(100, 140, 20), ...line(140, 110, 15)];
  const bars = daily(closes);

  it("runs the angles from the range's 50% point, timed from the last close through it", () => {
    const fan = computeMidpointFan(bars)!;
    expect(fan.midpoint).toBeCloseTo((99.5 + 140.5) / 2, 6);
    // The last close through 120: the first close at or under it on the fall.
    const cross = closes.findIndex((c, i) => i > 30 && c <= 120);
    expect(fan.originIndex).toBe(cross);
    const unit = atr(bars, 14);
    const elapsed = bars.length - 1 - cross;
    const up = fan.lines.find((l) => l.angle === "1x1" && l.direction === "up")!;
    const down = fan.lines.find((l) => l.angle === "1x1" && l.direction === "down")!;
    expect(up.price).toBeCloseTo(fan.midpoint + unit * elapsed, 6);
    expect(down.price).toBeCloseTo(fan.midpoint - unit * elapsed, 6);
  });

  it("is on the card", async () => {
    const { readDisclosedRules, describeDisclosedRules } = await import("@/lib/gann/disclosedRules");
    const ctx = readDisclosedRules(bars, closes[closes.length - 1]);
    expect(ctx.midpointFan?.midpoint).toBeCloseTo(120, 6);
    expect(describeDisclosedRules(ctx).some((l) => l.startsWith("From the 50% point (120.00), the 1x1 angles"))).toBe(true);
  });

  it("is null without a high and a low to halve", () => {
    expect(computeMidpointFan(daily(line(100, 140, 25)))).toBeNull();
    // A low and no high since: nothing to halve either.
    expect(computeMidpointFan(daily([...line(140, 100, 15), ...line(100, 140, 15)]))).toBeNull();
  });

  it("stays out of the targets and the scored criteria", async () => {
    const fs = await import("node:fs");
    for (const f of ["lib/scoring/score.ts", "lib/strat/levels.ts", "lib/scanTicker.ts", "lib/backtest/replay.ts", "lib/gann/fans.ts"]) {
      expect(fs.readFileSync(f, "utf8")).not.toMatch(/midpointFan|MidpointFan|squareFromHigh/);
    }
  });
});

describe("C-LEVELS-08: squaring price with time from a high", () => {
  it("brings a 1x1 from 60 to zero on day 60", () => {
    expect(squareFromHigh(60, 1, 60)).toBe(0);
    expect(squareFromHigh(60, 1, 15)).toBe(45);
  });

  it("brings a 100-point fall in about 100 months at the Master Course's 1 a month", () => {
    expect(squareFromHigh(100, 1, 100)).toBe(0);
  });
});
