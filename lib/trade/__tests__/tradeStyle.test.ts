import { describe, expect, it } from "vitest";
import { parseTradeStyle, TRADE_STYLES } from "@/lib/trade/tradeStyle";
import { readGannExit, type GannExitPosition } from "@/lib/gann/exitRules";
import { gannDayStop } from "@/lib/gann/dayStop";
import type { Bar } from "@/lib/types";

/** One bar per calendar day from 2026-03-02; each bar spans close ± 0.5. */
function daily(closes: number[]): Bar[] {
  const start = Date.UTC(2026, 2, 2);
  return closes.map((c, i) => ({ t: new Date(start + i * 86_400_000).toISOString(), o: c, h: c + 0.5, l: c - 0.5, c, v: 1000 }));
}

// A quiet base, then a long filled on day 30 at 51 with Rule 3's stop at 47,
// running up for four sessions.
const closes = [...Array.from({ length: 30 }, (_, i) => 50 + (i % 2 === 0 ? 0.3 : -0.3)), 51, 52, 53, 54, 55];
const bars = daily(closes);
const fill = 30;
const pos = (style: "swing" | "fast"): GannExitPosition => ({
  side: "long",
  entry: 51,
  initialStop: 47,
  entryDate: bars[fill].t.slice(0, 10),
  crossedLevel: null,
  style,
});

describe("trade style", () => {
  it("defaults to swing", () => {
    expect(parseTradeStyle(undefined)).toBe("swing");
    expect(parseTradeStyle("fast")).toBe("fast");
    expect(parseTradeStyle("day")).toBe("swing");
  });

  it("opens Fast on the same stop as Swing (Rule 3), trailing only once filled", () => {
    // On the fill session alone the day trail sits under that day's low.
    const atFill = readGannExit(pos("fast"), bars.slice(0, fill + 1), 51.5);
    expect(atFill.stop).toBeGreaterThanOrEqual(47);
    expect(TRADE_STYLES.fast.stopRule).toBe(`${TRADE_STYLES.swing.stopRule}, the same as Swing`);
  });

  it("trails Fast 3 points under the last completed day's low; Swing does not read it", () => {
    const fast = readGannExit(pos("fast"), bars, 55.5);
    const lastLow = bars[bars.length - 1].l;
    expect(fast.stopReason).toBe("day_low");
    expect(fast.stop).toBeCloseTo(gannDayStop({ extreme: lastLow, side: "long" })!, 9);
    const swing = readGannExit(pos("swing"), bars, 55.5);
    expect(swing.stopReason).not.toBe("day_low");
    expect(fast.stop).toBeGreaterThan(swing.stop);
  });

  it("mirrors for a short: 3 points over the last day's high", () => {
    const down = daily([...closes.slice(0, 30), 49, 48, 47, 46, 45]);
    const short: GannExitPosition = { side: "short", entry: 49, initialStop: 53, entryDate: down[fill].t.slice(0, 10), crossedLevel: null, style: "fast" };
    const r = readGannExit(short, down, 44.5);
    expect(r.stopReason).toBe("day_low");
    expect(r.stop).toBeCloseTo(gannDayStop({ extreme: down[down.length - 1].h, side: "short" })!, 9);
  });

  it("can be switched off by name in the replay's counterfactual cells", () => {
    const r = readGannExit(pos("fast"), bars, 55.5, null, new Set(["day_low"]));
    expect(r.stopReason).not.toBe("day_low");
  });
});

describe("the day trail on the fill session (review of #405)", () => {
  it("sits under the fill: the day bought's low is at or below the fill price", () => {
    // A gap-up crossing day (low 56) before the fill day must not be read.
    const gap = daily([...closes.slice(0, 30), 56.5, 51]);
    gap[31] = { ...gap[31], o: 51.4, h: 51.6, l: 50.8, c: 51 };
    const p: GannExitPosition = { side: "long", entry: 51, initialStop: 47, entryDate: gap[31].t.slice(0, 10), crossedLevel: null, style: "fast" };
    const r = readGannExit(p, gap, 51.6);
    expect(r.stop).toBeLessThan(51);
    expect(r.stop).toBeGreaterThanOrEqual(47);
  });
});

describe("walkGannExit with the Fast style", () => {
  it("leaves on the day trail where Swing holds", async () => {
    const { walkGannExit } = await import("@/lib/backtest/replay");
    // Daily chart: the base, then a run to 55 and a fall back to 51.5.
    const d = daily([...closes, 51.5, 51.4]);
    // Execution bars: one per session from the fill, the low each day's low.
    const exec = d.slice(fill);
    const base = { bars: exec, from: 0, maxBarsHeld: exec.length, long: true, entry: 51, stop: 47, dailyBars: d, crossedLevel: null };
    const fast = walkGannExit({ ...base, style: "fast" });
    const swing = walkGannExit({ ...base, style: "swing" });
    expect(fast.reason).toBe("day_low");
    expect(swing.reason).not.toBe("day_low");
    expect(fast.finalExit).toBeGreaterThan(51);
  });
});
